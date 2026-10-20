# « Et chez toi ? »: a map tried from an address, without an account. The
# visitor of a public map types their address and sees their own parcel,
# what its relief says (Trials::Reading) and what the region knows. The
# trial lives 48 hours under its token, then is swept away; signing up
# keeps it as the visitor's first map (#adopt!), as an invitation is
# accepted once signed in.
class MapTrial < ApplicationRecord
  include GeoJsonGeometry

  TTL = 48.hours
  MAX_PARCELS = 10

  class LimitReached < StandardError; end

  belongs_to :region, optional: true
  belongs_to :source_publication, class_name: "MapPublication", optional: true
  belongs_to :adopted_map, class_name: "Map", optional: true

  has_secure_token :token, length: 32

  scope :live, -> { where(expires_at: Time.current..) }
  scope :expired, -> { where(expires_at: ...Time.current) }

  validates :center, :expires_at, presence: true
  validates :address, length: { maximum: 300 }

  before_validation { self.expires_at ||= TTL.from_now }

  # Starts a trial at a place: its region, and the cadastral parcel there
  # when the region has a cadastre (a cadastre out of reach leaves the trial
  # without a parcel, to pick later by a click).
  def self.start(lng:, lat:, address: nil, source_publication: nil)
    lng, lat = Float(lng), Float(lat)
    trial = create!(
      center: FACTORY.point(lng, lat), address: address.to_s.strip.first(300).presence,
      region: Region.for_point(lng, lat), source_publication: source_publication&.live? ? source_publication : nil
    )
    begin
      trial.toggle_parcel(lng, lat)
    rescue Providers::GeoHttp::Error
      nil
    end
    trial
  end

  def live? = expires_at.future? && adopted_map_id.nil?

  def cadastre = @cadastre ||= Providers::Cadastre.for(region)

  # A click on the map: adds the parcel there, or takes it out when it is
  # already in. The outline is their union, the reading is redone.
  # Returns false when there is no parcel there.
  def toggle_parcel(lng, lat)
    return false unless cadastre
    found = cadastre.parcel_at(lng, lat)
    return false unless found

    list = parcels.reject { |p| p["capakey"] == found.capakey }
    if list.size == parcels.size
      raise LimitReached if list.size >= MAX_PARCELS
      list << { "capakey" => found.capakey, "label" => found.label, "lng" => found.lng, "lat" => found.lat }
    end
    self.parcels = list
    self.boundary = union_of(list, found)
    self.area_m2 = boundary && self.class.connection.select_value(
      "SELECT ST_Area(ST_GeomFromText($1, 4326)::geography)", "area", [ boundary.as_text ]
    )&.round(1)
    self.reading = {}
    save!
    true
  end

  # What the relief says, computed on first ask and kept with the trial.
  def reading!
    return reading if reading.present?
    update!(reading: Trials::Reading.new(self).call)
    reading
  end

  def boundary=(value)
    value = self.class.parse_geojson(value) if value.is_a?(Hash) || value.is_a?(String)
    value = FACTORY.multi_polygon([ value ]) if value.respond_to?(:geometry_type) && value.geometry_type == RGeo::Feature::Polygon
    super(value)
  end

  def bbox
    return nil unless boundary
    box = RGeo::Cartesian::BoundingBox.create_from_geometry(boundary)
    [ box.min_x, box.min_y, box.max_x, box.max_y ]
  end

  # Signing up keeps the trial: it becomes the user's map, with its address
  # and outline. Adopting twice gives the same map.
  def adopt!(user)
    return adopted_map if adopted_map
    raise LimitReached unless Billing::Scope.own(user).can_create_map?

    transaction do
      map = user.owned_maps.create!(
        name: map_name, address:, center:, boundary:, parcels: parcels.map { _1["capakey"] }, region:
      )
      update!(adopted_map: map)
      user.update_columns(source_publication_id: source_publication_id) if user.source_publication_id.nil? && source_publication_id
      map
    end
  end

  def as_inertia
    {
      token:, address:,
      center: [ center.x, center.y ],
      boundary: geometry_geojson(:boundary),
      bbox:,
      areaM2: area_m2,
      parcels: parcels.map { _1.slice("capakey", "label") },
      region: region&.as_inertia,
      expiresAt: expires_at.iso8601,
      cadastre: cadastre.present?,
      relief: Providers::Elevation.available?(region)
    }
  end

  private
    # The town of the address (« Rue X 1, 5530 Yvoir » → « Mon jardin à Yvoir »).
    def map_name
      town = address.to_s.split(",").last.to_s.sub(/\A\s*(?:[A-Z]{1,2}-?)?\d{4,5}\s*/, "").strip
      town.present? ? I18n.t("trials.map_name_in", town:) : I18n.t("trials.map_name")
    end

    def union_of(list, found)
      return nil if list.empty?
      geometries = list.map do |entry|
        parcel = entry["capakey"] == found.capakey ? found : cadastre.parcel(entry["capakey"], lng: entry["lng"], lat: entry["lat"])
        parcel&.geometry
      end
      Boundaries::GeometryUnion.call(geometries.compact)
    rescue Boundaries::GeometryUnion::Empty
      nil
    end
end

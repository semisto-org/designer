# A photo of the terrain, with what the map needs to place it: where it was
# taken (EXIF GPS, the phone's position or a click on the map), when, and the
# direction the camera was facing. Faces are never analysed (GDPR).
#
# The file is an Active Storage attachment. The browser reads the EXIF block
# and sends the position and date along with the upload, so the server never
# has to parse the file's metadata.
class MapPhoto < ApplicationRecord
  include PointLocation

  MAX_BYTES = 25.megabytes
  # Images only in v1 (video comes later). HEIC is refused on purpose: not
  # every browser can show it and libvips needs extra codecs to convert it.
  CONTENT_TYPES = %w[image/jpeg image/png image/webp].freeze
  SOURCES = %w[web phone import].freeze
  LOCATION_SOURCES = %w[exif device map manual].freeze
  # « Near » a thing on the map, for the inspector.
  NEARBY_METERS = 15
  # Two photos are « of the same spot » within this radius and heading gap.
  SAME_SPOT_METERS = 20
  SAME_SPOT_HEADING_DEGREES = 60

  belongs_to :map
  belongs_to :uploaded_by, class_name: "User", optional: true
  belongs_to :album, class_name: "PhotoAlbum", foreign_key: :photo_album_id, inverse_of: :photos, optional: true
  belongs_to :map_feature, optional: true

  # Variants go through libvips: rotated from EXIF, metadata (GPS included)
  # stripped. Viewers only ever get variants; the original file, EXIF and
  # all, is served to the map's editors alone (Maps::PhotosController#image).
  has_one_attached :image do |attachable|
    attachable.variant :thumb, resize_to_limit: [ 480, 480 ], format: :jpeg, saver: { strip: true, quality: 80 }, preprocessed: true
    attachable.variant :large, resize_to_limit: [ 1800, 1800 ], format: :jpeg, saver: { strip: true, quality: 85 }
  end

  before_validation :normalize_heading, :record_checksum, :clear_location_source_without_location

  validates :caption, length: { maximum: 500 }
  validates :source, inclusion: { in: SOURCES }
  validates :location_source, inclusion: { in: LOCATION_SOURCES }, allow_nil: true
  validates :heading, numericality: { greater_than_or_equal_to: 0, less_than: 360 }, allow_nil: true
  validate :image_is_acceptable
  validate :not_already_imported
  validate :album_and_feature_belong_to_map

  scope :chronological, -> { order(Arel.sql("COALESCE(map_photos.taken_at, map_photos.created_at) DESC"), id: :desc) }

  # Photos linked to a map feature or taken within `meters` of it, each with
  # its distance in meters (`distance_m`, measured to the geometry: inside a
  # zone counts as 0).
  def self.around_feature(feature, meters: NEARBY_METERS)
    geography = "(SELECT geometry::geography FROM map_features WHERE map_features.id = #{Integer(feature.id)})"
    where(map_id: feature.map_id)
      .where("map_photos.map_feature_id = :id OR (map_photos.location IS NOT NULL AND ST_DWithin(map_photos.location::geography, #{geography}, :meters))",
             id: feature.id, meters:)
      .select("map_photos.*",
              "CASE WHEN map_photos.location IS NULL THEN NULL ELSE ST_Distance(map_photos.location::geography, #{geography}) END AS distance_m")
  end

  # Other photos of the same spot (same place, similar direction), closest
  # first: the candidates for a before/after comparison.
  def same_spot(meters: SAME_SPOT_METERS, heading_tolerance: SAME_SPOT_HEADING_DEGREES)
    return [] unless location
    distance = self.class.sanitize_sql_array([
      "ST_Distance(map_photos.location::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) AS distance_m", lng, lat
    ])
    map.photos.located.within_meters_of_point(lng, lat, meters).where.not(id: id)
      .select("map_photos.*", distance).order(Arel.sql("distance_m"))
      .select { |other| heading_close?(other.heading, heading_tolerance) }
  end

  # JSON for the editor. Image URLs go through the authenticated image route
  # (Maps::PhotosController#image): the app checks the role on the map, then
  # redirects to the stored file.
  def as_inertia
    blob = image.attached? ? image.blob : nil
    meta = blob&.metadata || {}
    {
      id:, caption:, takenAt: taken_at&.iso8601, createdAt: created_at.iso8601,
      lng:, lat:, heading:, source:, locationSource: location_source,
      albumId: photo_album_id, featureId: map_feature_id,
      width: meta["width"], height: meta["height"],
      byteSize: blob&.byte_size, filename: blob&.filename&.to_s,
      uploadedBy: uploaded_by&.display_name,
      distanceM: has_attribute?(:distance_m) ? self[:distance_m]&.to_f&.round : nil
    }
  end

  private
    def normalize_heading
      self.heading = heading % 360 if heading
    end

    def record_checksum
      self.checksum = image.blob.checksum if image.attached? && checksum.blank?
    end

    def clear_location_source_without_location
      self.location_source = nil if location.nil?
    end

    def image_is_acceptable
      return errors.add(:base, I18n.t("soil_photos.errors.image_missing")) unless image.attached?
      blob = image.blob
      name = blob.filename.to_s
      # Active Storage trusts the declared type when the bytes say nothing
      # specific: look at the file's first bytes ourselves.
      detected = pending_upload_type
      unless CONTENT_TYPES.include?(blob.content_type) && (detected.nil? || CONTENT_TYPES.include?(detected))
        errors.add(:base, I18n.t("soil_photos.errors.not_an_image", name:, types: I18n.t("soil_photos.errors.types_label")))
      end
      if blob.byte_size > MAX_BYTES
        errors.add(:base, I18n.t("soil_photos.errors.too_large", name:, size: megabytes(blob.byte_size), max: megabytes(MAX_BYTES)))
      end
    end

    # The type the first bytes of a file being attached say it is (nil when
    # there is no pending upload to look at).
    def pending_upload_type
      attachable = attachment_changes["image"]&.attachable
      io = attachable.is_a?(Hash) ? attachable[:io] : attachable
      return nil unless io.respond_to?(:read) && io.respond_to?(:rewind)
      header = io.read(16).to_s
      io.rewind
      Marcel::MimeType.for(StringIO.new(header))
    end

    def not_already_imported
      return if checksum.blank?
      twin = self.class.where(map_id:, checksum:).where.not(id: id).exists?
      errors.add(:base, :already_imported, message: I18n.t("soil_photos.errors.already_imported", name: image.blob.filename.to_s)) if twin
    end

    def album_and_feature_belong_to_map
      errors.add(:base, I18n.t("soil_photos.errors.album_elsewhere")) if album && album.map_id != map_id
      errors.add(:base, I18n.t("soil_photos.errors.feature_elsewhere")) if map_feature && map_feature.map_id != map_id
    end

    def megabytes(bytes)
      mb = bytes / 1.megabyte.to_f
      (mb >= 10 || mb == mb.round ? mb.round.to_s : format("%.1f", mb).tr(".", ",")) + " Mo"
    end

    def heading_close?(other_heading, tolerance)
      return true if heading.nil? || other_heading.nil?
      diff = (heading - other_heading).abs % 360
      [ diff, 360 - diff ].min <= tolerance
    end
end

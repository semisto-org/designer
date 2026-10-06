# A plan image of a map (« Fond de plan »): a sketch, or a version of the
# plan handed to a client, laid on the map under the drawing so elements
# can be put back in the right place. A map keeps as many as it needs.
#
# The pose is what the editor drags with the mouse: the center of the image
# (WGS84), its width on the ground in meters and its rotation in degrees
# clockwise from north. The height follows `aspect` (width / height of the
# image, measured by the browser when it is uploaded). Opacity and visibility
# are shared by everyone on the map.
class PlanImage < ApplicationRecord
  MAX_BYTES = 30.megabytes
  CONTENT_TYPES = %w[image/jpeg image/png image/webp].freeze
  NAME_MAX = 80
  # A plan wider than 20 km, or narrower than 10 cm, is a wrong pose.
  WIDTH_RANGE = (0.1..20_000.0).freeze
  ASPECT_RANGE = (0.05..20.0).freeze
  # GPUs show textures up to 4096 px everywhere: the map gets a variant of
  # that size at most, in the image's own format (a PNG keeps its transparency).
  DISPLAY_SIZE = 4096

  belongs_to :map
  belongs_to :created_by, class_name: "User", optional: true

  has_one_attached :image do |attachable|
    attachable.variant :display, resize_to_limit: [ DISPLAY_SIZE, DISPLAY_SIZE ], saver: { strip: true }
  end

  normalizes :name, with: ->(name) { name.squish }

  before_validation :assign_position, on: :create
  before_validation :normalize_rotation

  validates :name, presence: true, length: { maximum: NAME_MAX }
  validates :center_lng, numericality: { in: -180..180 }
  validates :center_lat, numericality: { in: -85..85 }
  validates :width_m, numericality: { in: WIDTH_RANGE }
  validates :aspect, numericality: { in: ASPECT_RANGE }
  validates :opacity, numericality: { in: 0..1 }
  validates :visible, inclusion: { in: [ true, false ] }
  validate :image_is_acceptable

  scope :ordered, -> { order(:position, :id) }

  def as_inertia
    {
      id:, name:, centerLng: center_lng, centerLat: center_lat, widthM: width_m,
      rotation:, aspect:, opacity:, visible:, position:,
      imageUrl: Rails.application.routes.url_helpers.image_map_plan_image_path(map_id, id)
    }
  end

  private
    def assign_position
      self.position = (map&.plan_images&.maximum(:position) || -1) + 1 if map && position.to_i.zero?
    end

    def normalize_rotation
      self.rotation = (rotation.to_f % 360).round(2) unless rotation.nil?
    end

    def image_is_acceptable
      return errors.add(:image, :blank) unless image.attached?
      blob = image.blob
      errors.add(:image, :not_an_image) unless CONTENT_TYPES.include?(blob.content_type)
      errors.add(:image, :too_large, max: MAX_BYTES / 1.megabyte) if blob.byte_size > MAX_BYTES
    end
end

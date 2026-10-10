# « Mettre en image »: a photo of the terrain, with the idea sketched on it,
# painted by an image model (Providers::Magnific) as it could look once
# realised: a photo a few years on, a watercolour or a pencil drawing.
#
# The browser flattens the photo and the sketch into one JPEG (`input`); a
# job sends it to Magnific and waits for the image. The result becomes a new
# photo of the map (`result_photo`), at the same place and looking the same
# way, linked to its source (`MapPhoto#derived_from`): it can be compared
# with the photo of today, and sketched on in turn.
#
# The model is told to draw nothing of its own: no label, no note, no
# legend. Notes are the person's to add, on a new sketch.
class PhotoRendering < ApplicationRecord
  STYLES = %w[photo watercolor pencil].freeze
  STATUSES = %w[queued running done failed].freeze
  # What the error codes mean is in config/locales/photo_renderings.fr.yml.
  ERROR_CODES = %w[not_configured quota rejected upstream failed timeout download].freeze
  INSTRUCTIONS_MAX = 500
  INPUT_TYPES = %w[image/jpeg image/png image/webp].freeze
  INPUT_MAX_BYTES = 15.megabytes
  # Images each map owner can have painted per calendar month, all their
  # maps together (every image is paid in Magnific credits).
  MONTHLY_LIMIT = 30
  # Longer than that, the job gives up.
  DEADLINE = 5.minutes

  # The look asked for each style.
  STYLE_PROMPTS = {
    "photo" => "Render it as a natural photograph taken from the same spot a few years after the design was " \
               "realised, plants grown in, same season and light as the original photo. Photorealistic, natural colours.",
    "watercolor" => "Render it as a page of a hand-painted field notebook: loose watercolour washes on warm cream " \
                    "paper with fine graphite pencil outlines, soft natural colours, no digital look.",
    "pencil" => "Render it as a graphite pencil drawing on warm cream paper, an artist's sketch made on site: " \
                "confident outlines, light hatching for shade and volume, no colour."
  }.freeze

  belongs_to :map
  belongs_to :photo, class_name: "MapPhoto", foreign_key: :map_photo_id, inverse_of: :renderings
  belongs_to :sketch, class_name: "PhotoSketch", foreign_key: :photo_sketch_id, optional: true
  belongs_to :requested_by, class_name: "User", optional: true
  belongs_to :result_photo, class_name: "MapPhoto", optional: true

  has_one_attached :input

  normalizes :instructions, with: ->(text) { text.strip.presence }

  before_validation :inherit_map, on: :create

  validates :style, inclusion: { in: STYLES }
  validates :status, inclusion: { in: STATUSES }
  validates :error_code, inclusion: { in: ERROR_CODES }, allow_nil: true
  validates :instructions, length: { maximum: INSTRUCTIONS_MAX }
  validate :input_is_acceptable, on: :create
  validate :photo_and_sketch_belong_together

  scope :recent, -> { order(created_at: :desc, id: :desc) }
  scope :this_month, -> { where(created_at: Time.current.all_month) }
  scope :pending, -> { where(status: %w[queued running]) }

  after_create_commit -> { PhotoRenderingJob.perform_later(self) }

  # Images the owner of `map` has had painted this month, all their maps together.
  def self.used_this_month(owner)
    return 0 unless owner
    joins(:map).where(maps: { owner_id: owner.id }).this_month.where.not(status: "failed").count
  end

  def self.remaining_this_month(owner)
    [ MONTHLY_LIMIT - used_this_month(owner), 0 ].max
  end

  def finished? = status.in?(%w[done failed])

  # What the model is asked. In English: the model reads it better, and the
  # person's own words (`instructions`, often French) are quoted as they are.
  def prompt
    parts = []
    if sketch && sketch.strokes.present?
      parts << <<~TEXT.squish
        The reference image is a photo of a real place with a design idea hand-drawn over it:
        coloured lines, shapes and handwritten notes. Keep exactly the same viewpoint, framing and
        proportions, and everything that is not drawn over (buildings, roads, ground, existing trees,
        water). Turn each drawn element into what it stands for, at the exact place and size it is drawn.
        Unless told otherwise, lines stand for paths, hedges or edges, circles for tree crowns,
        small cloud shapes for shrubs and tufts for tall herbaceous plants or reeds.
        Handwritten notes are instructions or names: follow them, never draw them.
        Then remove every drawn line, shape and note: none of them may remain in the image.
      TEXT
    else
      parts << <<~TEXT.squish
        The reference image is a photo of a real place. Keep exactly the same viewpoint, framing,
        proportions and content.
      TEXT
    end
    parts << "What the drawing means, in the words of the person who drew it: «#{instructions}»." if instructions.present?
    parts << STYLE_PROMPTS.fetch(style)
    parts << "Do not add any text, label, caption, annotation, arrow, legend, signature or watermark."
    parts.join(" ")
  end

  # A link Magnific's servers can fetch the input from, for an hour.
  def input_url
    ActiveStorage::Current.set(url_options: self.class.url_options) { input.url(expires_in: 1.hour) }
  end

  def self.url_options
    Rails.application.config.action_mailer.default_url_options || { host: "localhost", port: 3000 }
  end

  def fail!(code)
    update!(status: "failed", error_code: code.to_s.presence_in(ERROR_CODES) || "failed", finished_at: Time.current)
  end

  # Turns the generated image (an IO) into a photo of the map, where the
  # source photo was taken and looking the same way.
  def complete!(io, content_type:)
    style_label = I18n.t("photo_renderings.styles.#{style}").downcase
    caption = if sketch
      I18n.t("photo_renderings.caption_sketch", style: style_label, sketch: sketch.name)
    else
      I18n.t("photo_renderings.caption", style: style_label)
    end
    extension = Rack::Mime::MIME_TYPES.invert[content_type] || ".jpg"
    transaction do
      result = map.photos.create!(
        image: { io:, filename: "#{I18n.t("photo_renderings.filename", style: style_label).parameterize}-#{id}#{extension}", content_type: },
        caption: caption.truncate(500), source: "ai", uploaded_by: requested_by,
        location: photo.location, location_source: photo.location_source, heading: photo.heading,
        album: photo.album, map_feature: photo.map_feature,
        derived_from: photo, rendering_style: style
      )
      update!(status: "done", result_photo: result, finished_at: Time.current, error_code: nil)
    end
  end

  def as_inertia
    {
      id:, photoId: map_photo_id, sketchId: photo_sketch_id, sketchName: sketch&.name,
      style:, instructions:, status:, errorCode: error_code, resultPhotoId: result_photo_id,
      requestedBy: requested_by&.display_name, createdAt: created_at.iso8601
    }
  end

  private
    def inherit_map
      self.map_id ||= photo&.map_id
    end

    def photo_and_sketch_belong_together
      errors.add(:base, I18n.t("photo_renderings.errors.elsewhere")) if photo && map_id && photo.map_id != map_id
      errors.add(:base, I18n.t("photo_renderings.errors.elsewhere")) if sketch && sketch.map_photo_id != map_photo_id
    end

    def input_is_acceptable
      return errors.add(:input, I18n.t("photo_renderings.errors.input_missing")) unless input.attached?
      blob = input.blob
      errors.add(:input, I18n.t("photo_renderings.errors.input_invalid")) unless INPUT_TYPES.include?(blob.content_type) && blob.byte_size <= INPUT_MAX_BYTES
    end
end

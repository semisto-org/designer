# A photo of the terrain, with what the map needs to place it: where it was
# taken (EXIF GPS, the phone's position or a click on the map), when, and the
# direction the camera was facing. Faces are never analysed (GDPR).
#
# A video of the terrain is a MapPhoto too (`kind` « video »): it is placed,
# dated, captioned and filed the same way, shown with a still frame
# (Active Storage preview, ffmpeg), and played from its own file. Sketches,
# « Mettre en image » and the bio-indicator reading are for photos only.
#
# The file is an Active Storage attachment. The browser reads the EXIF block
# and sends the position and date along with the upload. What the file says
# about the camera (model, settings, a drone's height and gimbal) is read
# afterwards by PhotoCameraJob into `camera`.
class MapPhoto < ApplicationRecord
  include PointLocation
  include HeicAttachment

  MAX_BYTES = 25.megabytes
  # What is stored for a photo; a HEIC photo (iPhone) is accepted at upload
  # and converted to JPEG (HeicAttachment).
  CONTENT_TYPES = %w[image/jpeg image/png image/webp].freeze
  # Videos as phones and drones record them (MP4, iPhone MOV), stored as they are.
  VIDEO_TYPES = %w[video/mp4 video/quicktime video/webm].freeze
  # Decided with Michael (2026-10-13): videos stay on the server's disk.
  VIDEO_MAX_BYTES = 1.gigabyte
  KINDS = %w[photo video].freeze
  UPLOAD_TYPES = (CONTENT_TYPES + HeicImage::TYPES + VIDEO_TYPES).freeze
  # « ai »: painted by « Mettre en image » (PhotoRendering) from another photo.
  SOURCES = %w[web phone import ai].freeze
  LOCATION_SOURCES = %w[exif device map manual].freeze
  # A photo of wild plants left for the user's AI to read (to_analyze), then
  # read (analyzed, with the AI's `bioindicator_summary`).
  BIOINDICATOR_STATUSES = %w[to_analyze analyzed].freeze
  # « Near » a thing on the map, for the inspector.
  NEARBY_METERS = 15
  # Two photos are « of the same spot » within this radius and heading gap.
  SAME_SPOT_METERS = 20
  SAME_SPOT_HEADING_DEGREES = 60

  belongs_to :map
  belongs_to :uploaded_by, class_name: "User", optional: true
  belongs_to :album, class_name: "PhotoAlbum", foreign_key: :photo_album_id, inverse_of: :photos, optional: true
  belongs_to :map_feature, optional: true
  has_many :bioindicator_observations, foreign_key: :map_photo_id, inverse_of: :photo, dependent: :nullify
  has_many :sketches, -> { ordered }, class_name: "PhotoSketch", dependent: :destroy, inverse_of: :photo
  has_many :renderings, class_name: "PhotoRendering", dependent: :destroy, inverse_of: :photo
  # A photo painted by « Mettre en image » keeps a link to the photo it came from.
  belongs_to :derived_from, class_name: "MapPhoto", optional: true
  # A photo taken again from the same spot (« Reprendre cette photo » on the
  # phone) points to the first photo of its series, so a garden's before and
  # after stay together whatever the GPS says.
  belongs_to :retake_of, class_name: "MapPhoto", optional: true, inverse_of: :retakes
  has_many :retakes, class_name: "MapPhoto", foreign_key: :retake_of_id, inverse_of: :retake_of, dependent: nil

  # Variants go through libvips: rotated from EXIF, metadata (GPS included)
  # stripped. Viewers only ever get variants; the original file, EXIF and
  # all, is served to the map's editors alone (Maps::PhotosController#image).
  has_one_attached :image do |attachable|
    attachable.variant :thumb, resize_to_limit: [ 480, 480 ], format: :jpeg, saver: { strip: true, quality: 80 }, preprocessed: true
    attachable.variant :large, resize_to_limit: [ 1800, 1800 ], format: :jpeg, saver: { strip: true, quality: 85 }
  end

  converts_heic :image
  before_validation :set_kind, :normalize_heading, :record_checksum, :clear_location_source_without_location, :retake_the_first
  before_destroy :hand_series_over
  after_create_commit -> { PhotoCameraJob.perform_later(self) }, if: -> { image.attached? }

  validates :caption, length: { maximum: 500 }
  validates :source, inclusion: { in: SOURCES }
  validates :kind, inclusion: { in: KINDS }
  validates :location_source, inclusion: { in: LOCATION_SOURCES }, allow_nil: true
  validates :bioindicator_status, inclusion: { in: BIOINDICATOR_STATUSES }, allow_nil: true
  validates :bioindicator_summary, length: { maximum: 6000 }
  validates :rendering_style, inclusion: { in: PhotoRendering::STYLES }, allow_nil: true
  validates :heading, numericality: { greater_than_or_equal_to: 0, less_than: 360 }, allow_nil: true
  validate :image_is_acceptable
  validate :not_already_imported
  validate :album_and_feature_belong_to_map
  validate :video_has_no_bioindicators
  validate :retake_of_a_photo_of_this_map

  scope :for_bioindicators, -> { where.not(bioindicator_status: nil) }
  scope :images, -> { where(kind: "photo") }
  scope :videos, -> { where(kind: "video") }
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

  # Other photos of the same spot, the candidates for a before/after
  # comparison (photos only): the photo's series first, oldest first, then
  # the photos taken nearby in a similar direction, closest first.
  def same_spot(meters: SAME_SPOT_METERS, heading_tolerance: SAME_SPOT_HEADING_DEGREES)
    retaken = series.reject { |other| other.id == id }
    return retaken unless location
    distance = self.class.sanitize_sql_array([
      "ST_Distance(map_photos.location::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography) AS distance_m", lng, lat
    ])
    nearby = map.photos.images.located.within_meters_of_point(lng, lat, meters).where.not(id: [ id, *retaken.map(&:id) ])
      .select("map_photos.*", distance).order(Arel.sql("distance_m"))
      .select { |other| heading_close?(other.heading, heading_tolerance) }
    retaken + nearby
  end

  # The first photo of the series and its retakes, oldest first (this photo
  # alone when it was never taken again).
  def series
    first_id = retake_of_id || id
    return [ self ] unless first_id
    map.photos.images.where(id: first_id).or(map.photos.images.where(retake_of_id: first_id))
      .sort_by { |photo| [ photo.taken_at || photo.created_at, photo.id ] }
  end

  def video? = kind == "video"

  # The still (photos) or still frame (videos) of a named size, ready to serve.
  def still(size) = image.representation(size)

  # JSON for the editor. Image URLs go through the authenticated image route
  # (Maps::PhotosController#image): the app checks the role on the map, then
  # redirects to the stored file.
  def as_inertia
    blob = image.attached? ? image.blob : nil
    meta = blob&.metadata || {}
    {
      id:, kind:, caption:, takenAt: taken_at&.iso8601, createdAt: created_at.iso8601,
      lng:, lat:, heading:, source:, locationSource: location_source,
      albumId: photo_album_id, featureId: map_feature_id, sketchesCount: sketches_count,
      derivedFromId: derived_from_id, renderingStyle: rendering_style, retakeOfId: retake_of_id,
      camera: camera.presence,
      width: meta["width"], height: meta["height"], durationS: meta["duration"]&.to_f&.round,
      byteSize: blob&.byte_size, filename: blob&.filename&.to_s,
      uploadedBy: uploaded_by&.display_name,
      bioindicatorStatus: bioindicator_status, bioindicatorSummary: bioindicator_summary,
      distanceM: has_attribute?(:distance_m) ? self[:distance_m]&.to_f&.round : nil
    }
  end

  private
    def set_kind
      self.kind = VIDEO_TYPES.include?(image.blob.content_type) ? "video" : "photo" if image.attached?
    end

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
      types = VIDEO_TYPES.include?(blob.content_type) ? VIDEO_TYPES : CONTENT_TYPES
      unless types.include?(blob.content_type) && (detected.nil? || types.include?(detected))
        errors.add(:base, I18n.t("soil_photos.errors.not_a_media", name:, types: I18n.t("soil_photos.errors.media_types_label")))
      end
      max = types == VIDEO_TYPES ? VIDEO_MAX_BYTES : MAX_BYTES
      if blob.byte_size > max
        key = types == VIDEO_TYPES ? "soil_photos.errors.video_too_large" : "soil_photos.errors.too_large"
        errors.add(:base, I18n.t(key, name:, size: megabytes(blob.byte_size), max: megabytes(max)))
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

    def video_has_no_bioindicators
      errors.add(:bioindicator_status, I18n.t("soil_photos.errors.video_bioindicators")) if video? && bioindicator_status.present?
    end

    # Always the first of the series, never a retake of a retake.
    def retake_the_first
      self.retake_of = retake_of.retake_of if retake_of&.retake_of
      self.retake_of = nil if retake_of && retake_of.id == id
    end

    def retake_of_a_photo_of_this_map
      return unless retake_of
      errors.add(:retake_of, :invalid) if retake_of.map_id != map_id || retake_of.video? || video?
    end

    # The series outlives its first photo: the oldest retake takes its place.
    def hand_series_over
      heirs = retakes.sort_by { |photo| [ photo.taken_at || photo.created_at, photo.id ] }
      return if heirs.empty?
      heir = heirs.shift
      MapPhoto.where(id: heir.id).update_all(retake_of_id: nil)
      MapPhoto.where(id: heirs.map(&:id)).update_all(retake_of_id: heir.id)
    end

    def album_and_feature_belong_to_map
      errors.add(:base, I18n.t("soil_photos.errors.album_elsewhere")) if album && album.map_id != map_id
      errors.add(:base, I18n.t("soil_photos.errors.feature_elsewhere")) if map_feature && map_feature.map_id != map_id
    end

    def megabytes(bytes)
      mb = bytes / 1.megabyte.to_f
      return format("%.1f", bytes / 1.gigabyte.to_f).tr(".", ",").delete_suffix(",0") + " Go" if bytes >= 1.gigabyte
      (mb >= 10 || mb == mb.round ? mb.round.to_s : format("%.1f", mb).tr(".", ",")) + " Mo"
    end

    def heading_close?(other_heading, tolerance)
      return true if heading.nil? || other_heading.nil?
      diff = (heading - other_heading).abs % 360
      [ diff, 360 - diff ].min <= tolerance
    end
end

# A document of a map's library: an architect's plan, a surveyor's report,
# a soil analysis, a permit, an old photo… Everyone on the map reads them;
# editors add, tag and remove them. The people behind the project add theirs
# from the project sheet's private link (`project_sheet_link`).
#
# The file is an Active Storage attachment. Images get variants for the
# library's tiles and preview; a PDF gets the first page as a small JPEG
# (`thumbnail`), drawn by the browser at upload (pdf.js), then by the
# server (MapDocumentThumbnailJob), which also covers PDFs sent through the
# MCP server. A PDF heavier than COMPRESS_PDF_ABOVE is compressed
# in the background (CompressMapDocumentJob) and the lighter copy replaces
# the original, to spare storage.
#
# A Markdown file (.md) is read as a page and edited in place
# (`replace_markdown!`): the file stays plain Markdown, so it downloads, and
# the MCP reads and writes it, like any other.
class MapDocument < ApplicationRecord
  include HeicAttachment
  include MapFeature::Tags

  MAX_BYTES = 200.megabytes
  COMPRESSIONS = %w[pending compressed unchanged].freeze
  MAX_THUMBNAIL_BYTES = 2.megabytes
  class_attribute :compress_pdf_above, default: 5.megabytes
  PREVIEW_IMAGE_TYPES = %w[image/jpeg image/png image/webp image/gif].freeze
  ORIGINS = %w[library project_sheet form].freeze
  MARKDOWN_EXTENSIONS = %w[md markdown].freeze
  # Larger Markdown files are only downloaded: nobody writes a megabyte of text.
  MAX_MARKDOWN_BYTES = 1.megabyte
  # Raised when the text changed since the editor read it.
  class StaleContent < StandardError; end
  KINDS = {
    "pdf" => %w[pdf],
    "image" => %w[jpg jpeg png webp gif heic heif tif tiff],
    "text" => %w[doc docx odt rtf txt md],
    "sheet" => %w[xls xlsx ods csv],
    "slides" => %w[ppt pptx odp],
    "plan" => %w[dwg dxf kml kmz gpx geojson]
  }.freeze

  belongs_to :map
  belongs_to :uploaded_by, class_name: "User", optional: true
  belongs_to :project_sheet_link, optional: true
  belongs_to :content_edited_by, class_name: "User", optional: true
  # An answer to one of the team's forms (Tally), filed here as Markdown.
  has_one :form_response, dependent: :nullify

  has_one_attached :file do |attachable|
    attachable.variant :thumb, resize_to_limit: [ 480, 480 ], format: :jpeg, saver: { strip: true, quality: 80 }
    attachable.variant :large, resize_to_limit: [ 2000, 2000 ], format: :jpeg, saver: { strip: true, quality: 85 }
  end
  has_one_attached :thumbnail

  converts_heic :file
  before_validation :default_title
  before_create :plan_compression
  after_create_commit :compress_later, if: -> { compression == "pending" }
  after_create_commit :thumbnail_later, if: -> { preview == "pdf" }

  validates :title, presence: true, length: { maximum: 200 }
  validates :description, length: { maximum: 2000 }
  validates :origin, inclusion: { in: ORIGINS }
  validates :compression, inclusion: { in: COMPRESSIONS }, allow_nil: true
  validate :file_is_acceptable
  validate :thumbnail_is_acceptable
  validate :link_belongs_to_map

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }
  scope :from_project_sheet, -> { where(origin: "project_sheet") }

  def extension = file.attached? ? File.extname(file.filename.to_s).delete(".").downcase : nil

  def kind = KINDS.find { |_, extensions| extensions.include?(extension) }&.first || "other"

  def markdown? = file.attached? && MARKDOWN_EXTENSIONS.include?(extension)

  # The text of a Markdown document that is small enough to read and edit.
  def editable_markdown? = markdown? && file.blob.byte_size <= MAX_MARKDOWN_BYTES

  def markdown_content
    return nil unless editable_markdown?
    file.download.dup.force_encoding(Encoding::UTF_8).scrub
  end

  # Fingerprint of the stored text: the editor sends back the one it read,
  # so a change made meanwhile (another person, the MCP) is never overwritten.
  def content_checksum = file.attached? ? file.blob.checksum : nil

  # A new Markdown document, written in Terranova.
  def self.build_markdown(map:, title:, content:, by:, tags: [])
    map.documents.new(title:, tags:, origin: "library", uploaded_by: by, content_edited_by: by, content_edited_at: Time.current).tap do |document|
      document.attach_markdown(content, filename: "#{title.to_s.parameterize.presence || "document"}.md")
    end
  end

  # Replaces the text of a Markdown document. `base` is the checksum the
  # editor read; nil skips the check (the MCP writes on its own).
  def replace_markdown!(content, by:, base: nil)
    raise ArgumentError, "document #{id} is not Markdown" unless markdown?
    with_lock do
      raise StaleContent if base && base != content_checksum
      self.content_edited_by = by
      self.content_edited_at = Time.current
      attach_markdown(content, filename: file.filename.to_s)
      save!
    end
  end

  def attach_markdown(content, filename:)
    file.attach(io: StringIO.new(content.to_s), filename:, content_type: "text/markdown", identify: false)
  end

  # What the browser can show as is: an image (its variants) or a PDF.
  def preview
    return nil unless file.attached?
    return "image" if PREVIEW_IMAGE_TYPES.include?(file.blob.content_type)
    "pdf" if file.blob.content_type == "application/pdf"
  end

  # Any file is welcome (a garden project gathers all sorts: plans, CAD
  # drawings, 3D scans, GIS layers…). Only images and PDFs, recognised by
  # their bytes (Active Storage identifies the type), are shown in the
  # browser; everything else, web pages and SVG included, is downloaded.
  # JSON for the library and the project sheet. `url` builds the file's
  # address (the map's authenticated route, or the private link's).
  def as_inertia(url:)
    blob = file.attached? ? file.blob : nil
    {
      id:, title:, description:, tags:, origin:, kind:, preview:,
      filename: blob&.filename&.to_s, contentType: blob&.content_type, byteSize: blob&.byte_size,
      compression:, originalByteSize: original_byte_size,
      createdAt: created_at.iso8601, updatedAt: updated_at.iso8601,
      uploadedBy: uploaded_by&.display_name, fromProjectLink: project_sheet_link_id.present?,
      form: (form_response&.as_inertia if origin == "form"),
      markdown: editable_markdown?,
      contentEditedAt: content_edited_at&.iso8601, contentEditedBy: content_edited_by&.display_name,
      thumbUrl: thumb_available? ? url.call(self, "thumb") : nil,
      previewUrl: preview ? url.call(self, preview == "image" ? "large" : "original") : nil,
      fileUrl: url.call(self, "original"),
      downloadUrl: url.call(self, "download")
    }
  end

  def thumb_available? = preview == "image" || thumbnail.attached?

  # The attachment and disposition behind a size of the file route.
  def served(size)
    case size
    when "thumb"
      return [ file.variant(:thumb).processed, :inline ] if preview == "image"
      [ thumbnail.attached? ? thumbnail : nil, :inline ]
    when "large"
      return [ file.variant(:large).processed, :inline ] if preview == "image"
      [ file, preview ? :inline : :attachment ]
    when "download"
      [ file, :attachment ]
    else
      [ file, preview ? :inline : :attachment ]
    end
  end

  private
    def plan_compression
      return unless file.attached? && file.blob.content_type == "application/pdf"
      self.compression = "pending" if file.blob.byte_size > compress_pdf_above
    end

    def compress_later = CompressMapDocumentJob.perform_later(self)

    def thumbnail_later = MapDocumentThumbnailJob.perform_later(self)

    def default_title
      return if title.present? || !file.attached?
      self.title = File.basename(file.filename.to_s, ".*").tr("_", " ").squish.first(200)
    end

    def file_is_acceptable
      return errors.add(:base, I18n.t("documents.errors.file_missing")) unless file.attached?
      name = file.blob.filename.to_s
      if file.blob.byte_size > MAX_BYTES
        errors.add(:base, I18n.t("documents.errors.too_large", name:, max: MAX_BYTES / 1.megabyte))
      end
    end

    def thumbnail_is_acceptable
      return unless thumbnail.attached?
      blob = thumbnail.blob
      return if %w[image/jpeg image/png].include?(blob.content_type) && blob.byte_size <= MAX_THUMBNAIL_BYTES
      errors.add(:base, I18n.t("documents.errors.thumbnail"))
    end

    def link_belongs_to_map
      errors.add(:base, I18n.t("documents.errors.link_elsewhere")) if project_sheet_link && project_sheet_link.map_id != map_id
    end
end

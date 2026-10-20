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
  include CountsTowardStorage
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
  # The first characters of a Markdown page shown on its library tile.
  EXCERPT_LENGTH = 200
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
  # The live edits of a Markdown page written together (MapDocumentChannel).
  has_many :collab_updates, class_name: "MapDocumentCollabUpdate", dependent: :delete_all
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

  # The first words of a Markdown page, without its syntax, for its tile in
  # the library. A form's answer shows its own fields instead. Cached by the
  # file's checksum, so the file is read once per version.
  def markdown_excerpt
    return nil unless editable_markdown? && origin != "form"
    Rails.cache.fetch([ "map_document_excerpt", file.blob.checksum ]) { self.class.plain_excerpt(markdown_content) }
  end

  # Markdown as plain words: the page's own heading (the tile shows the
  # title already), list and task marks, emphasis, links and images go.
  def self.plain_excerpt(markdown, length: EXCERPT_LENGTH)
    markdown.to_s
      .sub(/\A\s*#\s[^\n]*\n?/, "")
      .gsub(/^```.*?^```/m, " ")
      .gsub(/!\[[^\]]*\]\([^)]*\)/, " ")
      .gsub(/\[([^\]]*)\]\([^)]*\)/, '\1')
      .gsub(/^\s*([-*_])\s*(\1\s*){2,}$/, " ")
      .gsub(/^[ \t]*(\#{1,6}|>|[-*+]|\d+[.)])[ \t]+/, "")
      .gsub(/\[[ xX]\][ \t]*/, "")
      .gsub(/[*_`~|]+/, "")
      .squish.truncate(length, separator: " ").presence
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
  # editor read; nil skips the check (the MCP writes on its own). `live`
  # marks a save from the shared editor, whose edits are already shared:
  # every browser on the page saves what it has, and the same text twice
  # writes nothing. Any other write starts the shared editing afresh from
  # the new text (a new epoch), and the open pages reload it; a live save
  # still holding the text of an earlier epoch is refused (StaleContent).
  def replace_markdown!(content, by:, base: nil, live: false, epoch: nil)
    raise ArgumentError, "document #{id} is not Markdown" unless markdown?
    written = with_lock do
      raise StaleContent if base && base != content_checksum
      raise StaleContent if live && epoch && epoch != collab_epoch
      next false if live && OpenSSL::Digest::MD5.base64digest(content.to_s) == content_checksum
      self.content_edited_by = by
      self.content_edited_at = Time.current
      self.collab_epoch += 1 unless live
      attach_markdown(content, filename: file.filename.to_s)
      save!
      collab_updates.where.not(epoch: collab_epoch).delete_all unless live
      true
    end
    MapDocumentChannel.broadcast_to(self, { type: live ? "saved" : "reset", checksum: content_checksum, epoch: collab_epoch }) if written
    written
  end

  # The shared edits of the current epoch, for whoever joins: the Yjs
  # updates in order, merged in the browser.
  def collab_state
    rows = collab_updates.where(epoch: collab_epoch).order(:id).pluck(:id, :data)
    { epoch: collab_epoch, updates: rows.map { Base64.strict_encode64(_2) }, lastId: rows.last&.first }
  end

  # Keeps one Yjs update of the shared editing, unless the text was
  # replaced meanwhile (another epoch): then the edit is refused.
  def add_collab_update!(data, epoch:)
    return false unless epoch == reload.collab_epoch
    collab_updates.create!(data:, epoch:)
  end

  # Replaces the updates up to `last_id` with their merge (done in the
  # browser), so that joining stays quick on a long-lived document.
  def compact_collab!(merged, last_id:, epoch:)
    transaction do
      lock!
      scope = collab_updates.where(epoch:, id: ..last_id)
      next false unless epoch == collab_epoch && scope.exists?
      scope.delete_all
      collab_updates.create!(data: merged, epoch:, id: last_id)
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
  def as_inertia(url:, excerpt: false)
    blob = file.attached? ? file.blob : nil
    {
      id:, title:, description:, tags:, origin:, kind:, preview:,
      filename: blob&.filename&.to_s, contentType: blob&.content_type, byteSize: blob&.byte_size,
      compression:, originalByteSize: original_byte_size,
      createdAt: created_at.iso8601, updatedAt: updated_at.iso8601,
      uploadedBy: uploaded_by&.display_name, fromProjectLink: project_sheet_link_id.present?,
      form: (form_response&.as_inertia if origin == "form"),
      markdown: editable_markdown?,
      excerpt: (markdown_excerpt if excerpt),
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

# A file an AI sends straight to storage through the MCP server: create_upload
# makes the blob and a short-lived signed URL, the AI PUTs the bytes there,
# then attach_photos or attach_documents turns it into a photo or a document
# of the map it was made for, once. Uploads never attached are purged after
# UNATTACHED_LIFETIME (McpUploadPurgeJob).
#
# A file larger than part_size_for_new is sent in parts instead, one PUT per part to
# Mcp::UploadPartsController: no single request then carries more than the
# proxy in front of the app accepts (Cloudflare stops bodies over 100 MB)
# or lasts long enough to be cut on a slow connection, and a failed part is
# sent again on its own. The parts are put together into the blob, and
# checked against the file's MD5, when the upload is attached (assemble!).
#
# The map editor sends a drone view to import the same way, in parts
# (kind "aerial_view", AerialView#source_upload): the parts are read back
# one after the other by AerialViewImportJob and never put together in the
# storage. Such a file can be large and the connection slow, so it is kept
# longer (AERIAL_LIFETIME) and its blob is marked composed: its MD5 is only
# known once the browser has read the whole file (AerialViewsController).
class McpUpload < ApplicationRecord
  KINDS = %w[photo document].freeze
  AERIAL_VIEW = "aerial_view".freeze
  UNATTACHED_LIFETIME = 24.hours
  AERIAL_LIFETIME = 3.days
  URL_LIFETIME = 15.minutes
  # A whole number of MiB, so `dd bs=1048576` cuts the parts (smaller in tests).
  class_attribute :part_size_for_new, default: 32.megabytes
  # Long enough to send a 1 GB video over a slow connection.
  PARTS_URL_LIFETIME = 6.hours
  PART_PURPOSE = :mcp_upload_part

  # Why parts cannot be put together: `missing` lists the part numbers not
  # received; without, the assembled file did not match its MD5.
  class Incomplete < StandardError
    attr_reader :missing

    def initialize(missing = [])
      @missing = missing
      super(missing.any? ? "missing parts #{missing.join(', ')}" : "checksum mismatch")
    end
  end

  belongs_to :blob, class_name: "ActiveStorage::Blob"
  belongs_to :map
  belongs_to :user

  validates :kind, inclusion: { in: KINDS + [ AERIAL_VIEW ] }
  validates :part_size, numericality: { greater_than: 0 }, allow_nil: true

  scope :unattached, -> { where(attached_at: nil) }
  scope :stale, ->(now = Time.current) {
    unattached.where.not(kind: AERIAL_VIEW).where(created_at: ...(now - UNATTACHED_LIFETIME))
      .or(unattached.where(kind: AERIAL_VIEW, created_at: ...(now - AERIAL_LIFETIME)))
  }

  def self.multipart?(byte_size) = byte_size > part_size_for_new

  # The upload a part URL's token names, while it is valid.
  def self.find_for_part(token) = find_signed(token, purpose: PART_PURPOSE)

  def attached? = attached_at.present?

  def multipart? = part_size.present?

  # Whether the bytes reached the storage (the PUT was made and accepted;
  # for parts, once put together).
  def received? = blob.service.exist?(blob.key)

  def part_token = signed_id(purpose: PART_PURPOSE, expires_in: aerial_view? ? AERIAL_LIFETIME : PARTS_URL_LIFETIME)

  def aerial_view? = kind == AERIAL_VIEW

  def part_count = (blob.byte_size.to_f / part_size).ceil

  # Exact size of part `number` (1-based): the last one takes what is left.
  def part_byte_size(number)
    return nil unless number.between?(1, part_count)
    number < part_count ? part_size : blob.byte_size - part_size * (part_count - 1)
  end

  def part_key(number) = "#{blob.key}-part-#{number}"

  def store_part(number, io, checksum: nil)
    blob.service.upload(part_key(number), io, checksum:)
  end

  def missing_parts = (1..part_count).reject { |number| blob.service.exist?(part_key(number)) }

  # Puts the parts together into the blob's file and checks it against the
  # MD5 given to create_upload. Raises Incomplete (the parts are kept when
  # some are missing, deleted with the file when it does not match).
  def assemble!
    missing = missing_parts
    raise Incomplete.new(missing) if missing.any?
    service = blob.service
    service.compose((1..part_count).map { part_key(_1) }, blob.key, content_type: blob.content_type)
    md5 = Digest::MD5.new
    service.download(blob.key) { |chunk| md5 << chunk }
    unless md5.base64digest == blob.checksum
      service.delete(blob.key)
      delete_parts
      raise Incomplete
    end
    delete_parts
  end

  def delete_parts
    return unless multipart?
    (1..part_count).each { |number| blob.service.delete(part_key(number)) }
  end

  # Writes the parts, in order, to `path` without putting them together in
  # the storage, and checks the result against the blob's MD5. Raises
  # Incomplete like assemble!.
  def download_parts_to(path)
    missing = missing_parts
    raise Incomplete.new(missing) if missing.any?
    md5 = Digest::MD5.new
    File.open(path, "wb") do |file|
      (1..part_count).each do |number|
        blob.service.download(part_key(number)) do |chunk|
          md5 << chunk
          file.write(chunk)
        end
      end
    end
    raise Incomplete unless blob.checksum.present? && md5.base64digest == blob.checksum
    path
  end

  # Lets go of the parts and the blob (the upload goes with its blob).
  def discard!
    delete_parts
    blob.purge
  end
end

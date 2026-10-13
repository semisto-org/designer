# A file an AI sends straight to storage through the MCP server: create_upload
# makes the blob and a short-lived signed URL, the AI PUTs the bytes there,
# then attach_photos or attach_documents turns it into a photo or a document
# of the map it was made for, once. Uploads never attached are purged after
# UNATTACHED_LIFETIME (McpUploadPurgeJob).
class McpUpload < ApplicationRecord
  KINDS = %w[photo document].freeze
  UNATTACHED_LIFETIME = 24.hours
  URL_LIFETIME = 15.minutes

  belongs_to :blob, class_name: "ActiveStorage::Blob"
  belongs_to :map
  belongs_to :user

  validates :kind, inclusion: { in: KINDS }

  scope :unattached, -> { where(attached_at: nil) }
  scope :stale, ->(now = Time.current) { unattached.where(created_at: ...(now - UNATTACHED_LIFETIME)) }

  def attached? = attached_at.present?

  # Whether the bytes reached the storage (the PUT was made and accepted).
  def received? = blob.service.exist?(blob.key)
end

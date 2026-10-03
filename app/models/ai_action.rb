# One action an AI took through the MCP server: reading a map, listing its
# elements, proposing or withdrawing drafts. Shown to the map owner in the
# « Journal IA » panel, so nothing an AI does on a map goes unseen.
class AiAction < ApplicationRecord
  STATUSES = %w[ok error].freeze

  belongs_to :user
  belongs_to :map, optional: true

  validates :tool, presence: true
  validates :status, inclusion: { in: STATUSES }

  scope :newest_first, -> { order(created_at: :desc, id: :desc) }

  # Name of the client that proposed the latest drafts on a map.
  def self.latest_drafting_client(map)
    where(map:, tool: "propose_features", status: "ok").newest_first.pick(:client_name)
  end

  def as_inertia
    {
      id:, tool:, status:, arguments:, result:,
      errorMessage: error_message, clientName: client_name, credentialType: credential_type,
      userName: user.display_name, createdAt: created_at.iso8601
    }
  end
end

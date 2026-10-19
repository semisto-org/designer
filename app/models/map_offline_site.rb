# The map packed as a website that opens without Terranova, from a USB key
# or a laptop in the field (INTENT, « Nothing is taken hostage »): the plan
# over its aerial photo, the garden through the years, every photo and
# document, and the raw data (OfflineSite::Builder). One per map: asking
# again rebuilds it and replaces the archive.
#
# Every role on the map may take it, archived and read-only maps included:
# that is the point. Sensitive networks only for owners and editors who ask.
# The archive is Terranova's own file: it never counts against storage.
class MapOfflineSite < ApplicationRecord
  STATUSES = %w[pending building ready failed].freeze
  # A build that has not finished by then is considered dead.
  STALE_AFTER = 1.hour

  belongs_to :map
  belongs_to :requested_by, class_name: "User", optional: true
  has_one_attached :archive

  validates :status, inclusion: { in: STATUSES }

  def ready? = status == "ready" && archive.attached?
  def failed? = status == "failed"
  def working? = %w[pending building].include?(status) && updated_at > STALE_AFTER.ago

  # Starts a new build, unless one is already under way.
  def self.request!(map, by:, include_networks: false)
    site = find_or_initialize_by(map:)
    return site if site.persisted? && site.working? && site.include_networks == include_networks
    site.update!(status: "pending", requested_by: by, include_networks:, error: nil, finished_at: nil, summary: {})
    OfflineSiteJob.perform_later(site)
    site
  end

  def filename
    "terranova-#{map.name.to_s.parameterize.first(40).presence || "carte"}-#{(finished_at || Time.current).to_date.iso8601}.zip"
  end

  def as_inertia
    {
      status: working? || ready? || failed? ? status : "none",
      includeNetworks: include_networks,
      finishedAt: finished_at&.iso8601,
      byteSize: (archive.blob.byte_size if ready?),
      summary:,
      failed: failed?
    }
  end
end

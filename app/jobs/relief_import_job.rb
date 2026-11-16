# Imports a map's relief in the background (a square kilometre at 1 m takes
# several minutes on the SPW). One import per terrain at a time.
#
# A territory's relief, read by the MCP alone, has nobody to press
# « Relancer »: after a provider failure it tries again on its own, later and
# later (RETRY_WAITS), and says when (`retry_at`).
class ReliefImportJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: ->(terrain) { terrain.id }, duration: MapTerrain::STALE_AFTER if respond_to?(:limits_concurrency)
  discard_on ActiveRecord::RecordNotFound

  RETRY_WAITS = [ 5.minutes, 30.minutes, 2.hours ].freeze

  def perform(terrain)
    terrain.update_columns(attempts: terrain.attempts + 1, retry_at: nil, updated_at: Time.current)
    Relief::TerrainImport.new(terrain).call
    schedule_retry(terrain.reload) if terrain.territory_id
  end

  private
    def schedule_retry(terrain)
      return unless terrain.failed? && terrain.retriable?

      wait = RETRY_WAITS[terrain.attempts - 1]
      return unless wait

      terrain.update_columns(retry_at: wait.from_now)
      self.class.set(wait:).perform_later(terrain)
    end
end

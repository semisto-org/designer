# Imports a map's relief in the background (a square kilometre at 1 m takes
# several minutes on the SPW). One import per terrain at a time.
class ReliefImportJob < ApplicationJob
  queue_as :default
  limits_concurrency to: 1, key: ->(terrain) { terrain.id }, duration: MapTerrain::STALE_AFTER if respond_to?(:limits_concurrency)
  discard_on ActiveRecord::RecordNotFound

  def perform(terrain)
    Relief::TerrainImport.new(terrain).call
  end
end

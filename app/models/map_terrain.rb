# The relief of a map (see the migration): import state, grid geometry and
# the rasters as Active Storage blobs. The browser reads the rasters as typed
# arrays and computes drainage, rain, sun and station on its own.
class MapTerrain < ApplicationRecord
  STATUSES = %w[pending running ready failed].freeze
  FILES = %w[grid surface landcover texture].freeze
  # An import that has said nothing for this long is considered dead (worker
  # restarted mid-job) and can be relaunched.
  STALE_AFTER = 45.minutes

  belongs_to :map

  has_one_attached :grid
  has_one_attached :surface
  has_one_attached :landcover
  has_one_attached :texture

  validates :status, inclusion: { in: STATUSES }

  def ready? = status == "ready"
  def failed? = status == "failed"

  # Pending or running, and still alive.
  def in_progress?
    %w[pending running].include?(status) && updated_at > STALE_AFTER.ago
  end

  def version = (fetched_at || updated_at).to_i.to_s

  def file(kind)
    return nil unless FILES.include?(kind.to_s)

    attachment = public_send(kind)
    attachment.attached? ? attachment : nil
  end

  def stats = metadata.fetch("stats", {})

  # What the editor panel needs: state and key numbers, no grid.
  def as_summary
    {
      status:, progress:, error:,
      fetchedAt: fetched_at&.iso8601,
      startedAt: started_at&.iso8601,
      cellSizeM: cell_size_m, cols:, rows:,
      stats: stats.transform_keys { |k| k.camelize(:lower) },
      sources: metadata.fetch("sources", {}),
      warnings: metadata.fetch("warnings", []),
      attribution: metadata["attribution"],
      layers: { surface: surface.attached?, landcover: landcover.attached?, texture: texture.attached? }
    }
  end

  # The grid geometry the 3D page needs to decode the rasters.
  def as_grid(url_for:)
    {
      version:, crs:, west:, north:, step:, cols:, rows:, cellSizeM: cell_size_m, lat0:, marginM: margin_m,
      zMin: z_min, zMax: z_max, zUnit: z_unit, nodata:,
      surface: surface.attached? ? metadata["surface"]&.slice("z_min", "z_max", "z_unit")&.transform_keys { |k| k.camelize(:lower) } : nil,
      landcover: landcover.attached?,
      texture: texture.attached? ? metadata["texture"]&.slice("width", "height") : nil,
      files: FILES.index_with { |kind| file(kind) ? url_for.call(kind) : nil },
      stats: stats.transform_keys { |k| k.camelize(:lower) },
      sources: metadata.fetch("sources", {}),
      attribution: metadata["attribution"],
      fetchedAt: fetched_at&.iso8601
    }
  end
end

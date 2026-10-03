# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources) — Claudy's
# Maps::TerrainImport, generalised from one estate to any map: the extent
# comes from the map's boundary, the provider from its region, and the
# rasters land in Active Storage instead of files.
module Relief
  # Imports a map's relief from its region's elevation provider:
  # the terrain model (required), then the surface model, the land cover and
  # the ortho texture (each optional: a failure there leaves a warning, not a
  # failed import).
  #
  # Chunks of points are fetched on a few threads (the SPW answers in ~9 s
  # per chunk; sequentially a square kilometre would take a quarter of an
  # hour). Workers only do HTTP; this thread writes the progress.
  class TerrainImport
    class Failure < StandardError; end

    OPTIONAL = %i[surface landcover].freeze

    def initialize(terrain, provider: nil, logger: Rails.logger)
      @terrain = terrain
      @map = terrain.map
      @provider = provider || Providers::Elevation.for(@map.region)
      @logger = logger
    end

    def call
      raise Failure, I18n.t("relief.errors.unavailable") unless @provider
      raise Failure, I18n.t("relief.errors.no_boundary") unless @map.boundary

      @extent = GridPolicy.extent_for(@map.bbox, margin_m: margin_m)
      start!
      @warnings = []
      @sources = {}
      @done = 0
      @total = datasets.size * chunks.size + (@provider.dataset?(:texture) ? 1 : 0)

      heights = fetch(:terrain)
      packed = Raster.pack_heights(heights)
      attach(:grid, packed.bytes, "terrain.bin")
      @sources["terrain"] = @provider.dataset_label(:terrain)
      stats = Stats.new(heights, @extent, Mask.for_geometry(@map.boundary, @extent)).call

      surface = optional(:surface) { Raster.pack_heights(fetch(:surface)) }
      attach(:surface, surface.bytes, "surface.bin") if surface
      landcover = optional(:landcover) { fetch(:landcover) }
      attach(:landcover, Raster.pack_classes(landcover), "landcover.bin") if landcover
      texture = optional(:texture) { @provider.texture(@extent).tap { advance! } }
      attach(:texture, texture[:bytes], "ortho.jpg", "image/jpeg") if texture

      @terrain.update!(
        status: "ready", progress: 100, error: nil, fetched_at: Time.current,
        z_min: packed.z_min, z_max: packed.z_max, nodata_count: packed.nodata_count,
        metadata: {
          "provider" => @provider.key,
          "attribution" => @provider.attribution,
          "sources" => @sources,
          "warnings" => @warnings,
          "stats" => stats,
          "surface" => surface && { "z_min" => surface.z_min, "z_max" => surface.z_max, "z_unit" => Raster::Z_UNIT },
          "landcover" => landcover && { "counts" => landcover.compact.tally.transform_keys(&:to_s), "nodata" => Raster::LANDCOVER_NODATA },
          "texture" => texture && { "width" => texture[:width], "height" => texture[:height] }
        }.compact
      )
      @terrain
    rescue GridPolicy::TooLarge, Failure => e
      fail!(e.message)
    rescue StandardError => e
      @logger.error("[relief] import of map #{@map.id} failed: #{e.class}: #{e.message}")
      Sentry.capture_exception(e) if defined?(Sentry) && Sentry.initialized?
      fail!(I18n.t("relief.errors.provider_failed"))
    end

    private
      def margin_m
        (@map.region.setting(:relief, :margin_m) || GridPolicy::DEFAULT_MARGIN_M).to_f
      end

      def datasets
        @datasets ||= [ :terrain, *OPTIONAL.select { |name| @provider.dataset?(name) } ]
      end

      def chunks
        @chunks ||= (0...@extent.cells).each_slice(@provider.chunk_size).to_a
      end

      def start!
        @terrain.grid.purge
        @terrain.surface.purge
        @terrain.landcover.purge
        @terrain.texture.purge
        @terrain.update!(
          status: "running", progress: 0, error: nil, started_at: Time.current, provider: @provider.key,
          crs: "EPSG:3857", west: @extent.west, north: @extent.north, step: @extent.step,
          cols: @extent.cols, rows: @extent.rows, cell_size_m: @extent.cell_size_m, lat0: @extent.lat0,
          margin_m: @extent.margin_m, z_unit: Raster::Z_UNIT, nodata: Raster::NODATA,
          extent: @extent.polygon_wgs84, metadata: {}
        )
      end

      # The values of one dataset over the whole grid, in grid order.
      def fetch(name)
        values = Array.new(@extent.cells)
        jobs = Queue.new
        chunks.each_with_index { |indexes, i| jobs << [ i, indexes ] }
        results = Queue.new
        workers = Array.new([ @provider.threads, chunks.size ].min) do
          Thread.new do
            loop do
              _, indexes = begin
                jobs.pop(true)
              rescue ThreadError
                break
              end
              points = indexes.map { |index| @extent.point(index) }
              results << [ indexes, @provider.sample(name, points, @extent) ]
            rescue StandardError => e
              results << [ :error, e ]
              break
            end
          end
        end
        chunks.size.times do
          indexes, payload = results.pop
          if indexes == :error
            workers.each(&:kill)
            raise payload
          end
          indexes.each_with_index { |index, j| values[index] = payload[j] }
          advance!
        end
        workers.each(&:join)
        values
      end

      def advance!
        @done += 1
        @terrain.update_columns(progress: (@done * 99 / [ @total, 1 ].max), updated_at: Time.current)
      end

      # An optional layer that fails leaves a warning (the relief stays
      # usable without shadows of trees or land cover).
      def optional(name)
        return nil unless @provider.dataset?(name)

        result = yield
        @sources[name.to_s] = @provider.dataset_label(name)
        result
      rescue StandardError => e
        @logger.warn("[relief] #{name} of map #{@map.id} skipped: #{e.class}: #{e.message}")
        @warnings << I18n.t("relief.warnings.#{name}")
        nil
      end

      def attach(name, bytes, filename, content_type = "application/octet-stream")
        @terrain.public_send(name).attach(io: StringIO.new(bytes), filename:, content_type:, identify: false)
      end

      def fail!(message)
        @terrain.update!(status: "failed", error: message, progress: 0)
        @terrain
      end
  end
end

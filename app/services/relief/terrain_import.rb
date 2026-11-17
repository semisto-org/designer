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
  # A territory's relief is the terrain model only, on a coarse grid
  # (GridPolicy::TERRITORY_CELL_SIZES) with a wider margin: what the MCP's
  # get_catchment needs to follow water across a commune.
  #
  # Chunks of points are fetched on a few threads (the SPW answers in ~9 s
  # per chunk; sequentially a square kilometre would take a quarter of an
  # hour). Workers only do HTTP; this thread writes the progress.
  class TerrainImport
    class Failure < StandardError; end
    # The provider answered, but not for enough of the place: worth another
    # try later, unlike a missing boundary or a place too large.
    class Incomplete < Failure; end

    OPTIONAL = %i[surface landcover].freeze
    # A territory's coarse cells are spread over kilometres: the SPW's cost
    # follows the area a request touches, not its number of points, and a
    # map's 20,000-point chunk across a commune ends in a gateway timeout.
    # 1,500 points at 30 m answer in about 6 s.
    TERRITORY_CHUNK = 1_500
    # The region's outline is simplified and its rasters run past it: cells
    # farther than this beyond it are not asked (they are no data), the
    # others are, and a short answer there is split (ArcgisElevation).
    COVERAGE_BUFFER_M = 1_000
    # Above this share of the place without heights, the relief is refused
    # rather than handed over full of holes.
    MAX_MISSING_SHARE = 0.2

    def initialize(terrain, provider: nil, logger: Rails.logger)
      @terrain = terrain
      @owner = terrain.owner
      @territory = @owner.is_a?(Territory)
      # A fine window of a territory (5 m around a point), beside its coarse relief.
      @detail = terrain.detail_key && DetailWindow.from_key(terrain.detail_key)
      @provider = provider || Providers::Elevation.for(@owner.region)
      @logger = logger
    end

    def call
      raise Failure, I18n.t("relief.errors.unavailable") unless @provider
      raise Failure, I18n.t("relief.errors.no_boundary") unless @owner.boundary

      @extent = @detail ? @detail.extent : grid_policy.extent_for(@owner.bbox)
      @covered = coverage_mask
      start!
      @warnings = []
      @sources = {}
      @done = 0
      @total = datasets.size * chunks.size + (!@territory && @provider.dataset?(:texture) ? 1 : 0)

      heights = fetch(:terrain)
      check_coverage!(heights)
      packed = Raster.pack_heights(heights)
      attach(:grid, packed.bytes, "terrain.bin")
      @sources["terrain"] = @provider.dataset_label(:terrain)
      stats = Stats.new(heights, @extent, Mask.for_geometry(@owner.boundary, @extent)).call

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
      BuildingsWarmJob.perform_later(@owner) unless @territory
      MapFeature.regrade_map(@owner) unless @territory
      @terrain
    rescue Incomplete => e
      fail!(e.message, retriable: true)
    rescue GridPolicy::TooLarge, Failure => e
      fail!(e.message)
    rescue StandardError => e
      @logger.error("[relief] import of #{label} failed: #{e.class}: #{e.message}")
      Sentry.capture_exception(e) if defined?(Sentry) && Sentry.initialized?
      fail!(I18n.t("relief.errors.provider_failed"), retriable: true)
    end

    private
      def grid_policy
        if @territory
          margin = @owner.region&.setting(:territory, :relief_margin_m) || GridPolicy::TERRITORY_MARGIN_M
          GridPolicy.new(margin_m: margin, max_cells: FlowGrid::MAX_CELLS, cell_sizes: GridPolicy::TERRITORY_CELL_SIZES)
        else
          GridPolicy.new(margin_m: (@owner.region.setting(:relief, :margin_m) || GridPolicy::DEFAULT_MARGIN_M).to_f)
        end
      end

      def label = "#{@territory ? "territory" : "map"} #{@owner.id}#{" window #{@detail.key}" if @detail}"

      def datasets
        @datasets ||= [ :terrain, *(@territory ? [] : OPTIONAL.select { |name| @provider.dataset?(name) }) ]
      end


      # Only the cells the provider's region covers are asked (a territory's
      # 2 km margin runs into the neighbouring region, whose relief another
      # service holds).
      def chunks
        @chunks ||= (0...@extent.cells).select { |index| covered?(index) }.each_slice(chunk_size).to_a
      end

      def chunk_size
        limit = if @detail then DetailWindow::CHUNK
        elsif @territory then TERRITORY_CHUNK
        end
        limit ? [ limit, @provider.chunk_size ].min : @provider.chunk_size
      end

      def coverage_mask
        source = @owner.region&.setting_region(:relief)
        return nil unless source && !source.europe?

        buffer = (source.setting(:relief, :coverage_buffer_m) || COVERAGE_BUFFER_M).to_f
        outline = source.outline_buffered(buffer)
        outline && Mask.for_geometry(outline, @extent)
      end

      def covered?(index) = @covered.nil? || @covered.getbyte(index) == 1

      # The place itself must have its heights: a few holes on a border are
      # fine, a relief mostly empty is a failure that says so.
      # A window is checked on the cells the provider covers: one on the
      # region's border may lie half beyond the commune.
      def check_coverage!(heights)
        inside = @detail ? @covered : Mask.for_geometry(@owner.boundary, @extent)
        total = 0
        missing = 0
        heights.each_with_index do |z, index|
          next unless inside.nil? || inside.getbyte(index) == 1

          total += 1
          missing += 1 if z.nil?
        end
        return if total.zero? || missing <= total * MAX_MISSING_SHARE

        raise Incomplete, I18n.t("relief.errors.mostly_missing", share: (100.0 * missing / total).round)
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
        return nil if @territory || !@provider.dataset?(name)

        result = yield
        @sources[name.to_s] = @provider.dataset_label(name)
        result
      rescue StandardError => e
        @logger.warn("[relief] #{name} of #{label} skipped: #{e.class}: #{e.message}")
        @warnings << I18n.t("relief.warnings.#{name}")
        nil
      end

      def attach(name, bytes, filename, content_type = "application/octet-stream")
        @terrain.public_send(name).attach(io: StringIO.new(bytes), filename:, content_type:, identify: false)
      end

      def fail!(message, retriable: false)
        @terrain.update!(status: "failed", error: message, progress: 0, metadata: @terrain.metadata.merge("retriable" => retriable))
        @terrain
      end
  end
end

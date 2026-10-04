# The « Dossier du projet » of a map: the document a designer hands to a
# client, a municipality or a funder, gathered in one JSON for the printable
# page (Maps::DossiersController). Nothing is computed twice: each block reads
# the module that owns it (ProjectSheet, terrain stats, Relief::Rainwater,
# Climate::MapReport, SoilSample, PlantList, PlantingAlerts,
# RegulatoryAlerts, MapPhoto, FinancialPlan) and applies the same rules:
#
# - entitlements follow the map owner's plan (Entitlements.for_map): relief
#   and water figures, climate projections, plant climate checks and the
#   soil reading are analyses; a locked block is `{ locked: true }` and
#   carries no data;
# - sensitive networks (water, gas, electricity, ethernet) stay out unless
#   an owner or editor asks for them;
# - only accepted features count: AI drafts and rejected proposals never
#   reach a dossier.
#
# Output keys are camelCase (JSON for the frontend, types/dossier.ts).
class MapDossier
  SENSITIVE_LAYERS = MapGeojsonExport::SENSITIVE_LAYERS
  # Design layers described in the « Aménagement » section, in that order.
  # Notes are working annotations: on the plan, never listed.
  DESIGN_LAYERS = %w[existing water access structures plants animals networks].freeze
  PLANT_KINDS = %w[plant patch].freeze
  ITEMS_PER_KIND = 12
  PHOTO_CANDIDATES = 60
  DEFAULT_PHOTOS = 6
  MAX_PAIRS = 2
  # Two photos of the same spot are a « before / after » when this far apart.
  BEFORE_AFTER_MIN_DAYS = 30
  IDENTIFY_ZOOM = 18
  MAX_IDENTIFY_LAYERS = 12
  # Catalogue values the dossier shows (plant list sizes, climate checks):
  # the sources section cites where each one comes from.
  PLANT_SOURCE_FIELDS = {
    "spread" => %w[spread_min_m spread_max_m],
    "height" => %w[height_min_m height_max_m],
    "hardiness" => %w[hardiness_zone min_temperature_c]
  }.freeze

  attr_reader :map, :role

  def initialize(map, user:, include_networks: false, climate_provider: nil, today: Date.current)
    @map = map
    @user = user
    @role = map.role_for(user)
    @include_networks = include_networks
    @climate_provider = climate_provider
    @today = today
  end

  def can_edit? = %w[owner editor].include?(role)

  # Networks only when asked, and only by someone who may edit the map.
  def include_networks? = @include_networks && can_edit?

  def entitlements = @entitlements ||= Entitlements.for_map(map)

  def analyses? = entitlements.analyses?

  def as_json(*)
    {
      generatedOn: @today.iso8601,
      map: map_json,
      viewer: { role:, canEdit: can_edit? },
      entitlements: { analyses: analyses?, pdfExport: entitlements.pdf_export? },
      networks: { included: include_networks?, count: can_edit? ? network_count : 0 },
      cover: cover_json,
      project: project_json,
      terrain: terrain_json,
      climate: climate_json,
      soil: soil_json,
      design: design_json,
      plants: plants_json,
      alerts: alerts_json,
      photos: photos_json,
      finances: finances_json,
      sources: sources_json
    }
  end

  private
    # ── Map and cover ────────────────────────────────────────────────────

    def map_json
      {
        id: map.id, name: map.name, description: map.description.presence, address: map.address.presence,
        areaM2: map.area_m2, parcels: Array(map.parcels).map(&:to_s), stage: map.stage,
        ownerName: map.owner.display_name, region: { key: map.region.key, name: map.region.name },
        updatedAt: map.updated_at.iso8601
      }
    end

    # What the cover's plan is drawn from: the boundary, the accepted
    # features (networks only when included) and the region's aerial base.
    def cover_json
      {
        boundary: map.geometry_geojson(:boundary),
        bbox: map.bbox || features_bbox,
        center: map.center && [ map.center.x, map.center.y ],
        features: { type: "FeatureCollection", features: shown_features.map { |f| cover_feature(f) } },
        base: raster_json(base_layer),
        cadastre: raster_json(cadastre_layer)
      }
    end

    def shown_features
      @shown_features ||= begin
        scope = map.features.active.order(:layer, :id)
        scope = scope.where.not(layer: SENSITIVE_LAYERS) unless include_networks?
        scope.to_a
      end
    end

    def shown_ids = @shown_ids ||= shown_features.map(&:id).to_set

    def network_count = map.features.active.where(layer: SENSITIVE_LAYERS).count

    # Plants carry their adult crown (m) and strata, so the cover can draw
    # them at true size like the editor does.
    def cover_feature(feature)
      json = feature.as_geojson
      if feature.kind == "plant" && (crown = plant_crown(feature))
        json[:properties] = json[:properties].merge("dossierCrownM" => crown[:crown], "dossierStrata" => crown[:strata])
      end
      json
    end

    def plant_crown(feature)
      species_id = Integer(feature.properties["species_id"].to_s, exception: false) or return nil
      species = quantities.species_index[species_id] || PlantSpecies.find_by(id: species_id) or return nil
      variety_id = Integer(feature.properties["variety_id"].to_s, exception: false)
      strata = quantities.strata_for([ species_id, variety_id ]) || species.default_strata
      { crown: species.adult_spread(strata).metres, strata: }
    end

    def features_bbox
      return nil if shown_features.empty?
      box = RGeo::Cartesian::BoundingBox.new(GeoJsonGeometry::FACTORY)
      shown_features.each { |f| box.add(f.geometry) }
      [ box.min_x, box.min_y, box.max_x, box.max_y ]
    end

    # The region's aerial photo (its default raster base), else any raster base.
    def base_layer
      bases = region_layers.select { |l| l.base? && l.raster? }
      bases.find(&:default?) || bases.first
    end

    def cadastre_layer = region_layers.find { |l| !l.base? && l.raster? && l.role == "cadastre" }

    def region_layers = @region_layers ||= map.region.catalogue.enabled.to_a

    def raster_json(layer)
      return nil unless layer
      { key: layer.key, name: layer.name, tileUrl: layer.tile_url, tileSize: layer.tile_size,
        minZoom: layer.min_zoom, maxZoom: layer.max_zoom, attribution: plain(layer.attribution) }
    end

    # ── Project sheet ────────────────────────────────────────────────────

    def project_json
      sheet = map.project_sheet
      { values: sheet.to_h.except("meta"), percent: sheet.progress[:percent], schema: ProjectSheet.schema_json }
    end

    # ── Terrain ──────────────────────────────────────────────────────────

    def terrain_json
      {
        areaM2: map.area_m2,
        perimeterM: boundary_measure("ST_Perimeter(boundary::geography)")&.round(1),
        parcels: Array(map.parcels).map(&:to_s),
        point: inside_point && { lng: inside_point[0].round(6), lat: inside_point[1].round(6) },
        identify: identify_json,
        relief: relief_json
      }
    end

    # What the region's data layers say at the terrain: asked by the page
    # itself (GET /maps/:id/identify), so a slow provider never holds the
    # dossier back. A point inside the boundary, else the map's centre.
    def identify_json
      point = inside_point
      layers = region_layers.select { |l| !l.base? && l.identifiable? }.first(MAX_IDENTIFY_LAYERS)
      return nil if point.nil? || layers.empty?
      { zoom: IDENTIFY_ZOOM, layers: layers.map { |l| { key: l.key, name: l.name, group: l.group_name } } }
    end

    def inside_point
      @inside_point ||= if map.boundary
        row = Map.where(id: map.id).pick(Arel.sql("ST_X(ST_PointOnSurface(boundary))"), Arel.sql("ST_Y(ST_PointOnSurface(boundary))"))
        row&.all? ? row.map(&:to_f) : nil
      elsif map.center
        [ map.center.x, map.center.y ]
      end
    end

    def boundary_measure(sql)
      return nil unless map.boundary
      Map.where(id: map.id).pick(Arel.sql(sql))&.to_f
    end

    # Relief key numbers and the roofs' rainwater: an analysis (ReliefGate).
    def relief_json
      return { locked: true } unless analyses?
      terrain = map.terrain
      relief = if terrain&.ready?
        { available: true, stats: terrain.stats.transform_keys { |k| k.camelize(:lower) }, cellSizeM: terrain.cell_size_m,
          fetchedAt: terrain.fetched_at&.iso8601, sources: terrain.metadata.fetch("sources", {}),
          attribution: plain(terrain.metadata["attribution"]) }
      else
        { available: false, reason: terrain&.failed? ? "failed" : (terrain&.in_progress? ? "running" : "not_imported") }
      end
      relief.merge(rainwater: Relief::Rainwater.new(map).call)
    end

    # ── Climate ──────────────────────────────────────────────────────────

    def climate_json
      report = climate_report
      { entitled: report["entitled"], current: report["current"], projections: report["projections"],
        plants: report["plants"], sources: report["sources"] }
    rescue StandardError => error
      Rails.logger.warn("[dossier] climate unavailable for map #{map.id}: #{error.class}: #{error.message}")
      unavailable = { "available" => false, "reason" => "upstream_error" }
      { entitled: analyses?, current: unavailable, projections: unavailable, plants: unavailable.merge("count" => 0), sources: [] }
    end

    def climate_report
      @climate_report ||= Climate::MapReport.new(map, provider: @climate_provider, entitlements:).as_json
    end

    # ── Soil ─────────────────────────────────────────────────────────────

    # Samples and their raw figures are free; the reading (bands, texture
    # class) is an analysis, included by SoilSample#as_inertia only when
    # entitled. Bio-indicator plants are reference, free.
    def soil_json
      observations = map.bioindicator_observations.recent.to_a
      {
        analyses: analyses?,
        samples: map.soil_samples.ordered.with_attached_lab_report.map { |s| s.as_inertia(analyses: analyses?) },
        fields: SoilSample::RESULT_FIELDS.map { |key, spec| { key:, unit: spec[:unit] } },
        provenance: SoilAnalysis::Interpretation::PROVENANCE,
        bioindicators: {
          observations: observations.map { |o| o.as_inertia.slice(:id, :speciesName, :latinName, :abundance, :observedOn, :indicators) },
          summary: SoilAnalysis::BioindicatorCatalog.tally(observations)
        }
      }
    end

    # ── Design ───────────────────────────────────────────────────────────

    # Elements per layer and kind, measured on the ellipsoid: count, total
    # length (lines) and area (surfaces), and the elements themselves (the
    # page adds each one's estimates from the element library).
    def design_json
      measures = design_measures
      layers = DESIGN_LAYERS.filter_map do |layer|
        rows = measures.select { |row| row[:layer] == layer }
        next if rows.empty?
        kinds = rows.group_by { |row| row[:kind] }.map do |kind, items|
          listed = PLANT_KINDS.include?(kind) ? [] : items.first(ITEMS_PER_KIND)
          {
            kind:, count: items.size,
            lengthM: sum_of(items, :length), areaM2: sum_of(items, :area),
            items: listed.map { |i| { id: i[:id], name: i[:name], lengthM: i[:length], areaM2: i[:area] } },
            more: PLANT_KINDS.include?(kind) ? 0 : [ items.size - ITEMS_PER_KIND, 0 ].max
          }
        end
        { layer:, count: rows.size, kinds: kinds.sort_by { |k| [ -k[:count], k[:kind] ] } }
      end
      { layers: }
    end

    def design_measures
      ids = shown_features.select { |f| DESIGN_LAYERS.include?(f.layer) }.map(&:id)
      return [] if ids.empty?
      MapFeature.where(id: ids).order(:id).pluck(
        :id, :layer, :kind, :name,
        Arel.sql("CASE WHEN ST_Dimension(geometry) = 1 THEN ST_Length(geometry::geography) END"),
        Arel.sql("CASE WHEN ST_Dimension(geometry) = 2 THEN ST_Area(geometry::geography) END")
      ).map do |id, layer, kind, name, length, area|
        { id:, layer:, kind:, name: name.presence, length: length&.to_f&.round(1), area: area&.to_f&.round(1) }
      end
    end

    def sum_of(items, key)
      values = items.filter_map { |i| i[key] }
      values.empty? ? nil : values.sum.round(1)
    end

    # ── Plants ───────────────────────────────────────────────────────────

    def quantities = @quantities ||= map.planted_quantities

    def plant_list = @plant_list ||= PlantList.new(quantities)

    def plants_json
      list = plant_list.as_json
      sources = field_sources_by_species
      list[:rows] = plant_list.rows.map do |row|
        row.as_json.merge(spreadSource: size_source(sources[row.species_id], "spread", row.species_id))
      end
      list.merge(hardinessZone: map.hardiness_zone)
    end

    # Where the spread shown on a row comes from: the catalogue source of
    # the species' value ("pfaf", "semisto"…), "catalogue" when the value
    # has no recorded provenance, "strata_default" when the species has no
    # value and the strata's default is shown.
    def size_source(rows, field, species_id)
      species = quantities.species_index[species_id]
      return "strata_default" if species.nil? || PLANT_SOURCE_FIELDS[field].none? { |f| species.public_send(f).present? }
      PLANT_SOURCE_FIELDS[field].filter_map { |f| rows&.[](f)&.source }.first || "catalogue"
    end

    # { species_id => { field => PlantFieldSource } } for the fields shown.
    def field_sources_by_species
      @field_sources_by_species ||= begin
        ids = plant_list.rows.map(&:species_id).uniq
        PlantFieldSource.where(record_type: "PlantSpecies", record_id: ids, field: PLANT_SOURCE_FIELDS.values.flatten)
          .where.not(status: "empty")
          .group_by(&:record_id).transform_values { |rows| rows.index_by(&:field) }
      end
    end

    # ── Alerts ───────────────────────────────────────────────────────────

    # Both kinds of alerts, only on what the dossier shows: regulatory
    # alerts on AI drafts or on left-out networks are dropped.
    def alerts_json
      regulatory = RegulatoryAlerts.new(map)
      {
        planting: PlantingAlerts.new(quantities).as_json,
        regulatory: regulatory.as_json.merge(alerts: regulatory.alerts.select { |a| a.feature_ids.all? { |id| shown_ids.include?(id) } }.map(&:as_json))
      }
    end

    # ── Photos ───────────────────────────────────────────────────────────

    # The most recent photos to choose from, the before / after pairs
    # (same spot, same direction, at least a month apart) and a default
    # choice: pairs first, then captioned photos, then the latest.
    def photos_json
      photos = map.photos.with_attached_image.chronological.limit(PHOTO_CANDIDATES).to_a
      pairs = before_after_pairs(photos)
      {
        total: map.photos.count,
        items: photos.map { |p| photo_json(p) },
        pairs:,
        defaults: default_photo_ids(photos, pairs)
      }
    end

    def photo_json(photo)
      routes = Rails.application.routes.url_helpers
      meta = photo.image.attached? ? photo.image.blob.metadata : {}
      {
        id: photo.id, caption: photo.caption.presence, takenAt: (photo.taken_at || photo.created_at).iso8601,
        dated: photo.taken_at.present?, width: meta["width"], height: meta["height"],
        thumbUrl: routes.image_map_photo_path(map, photo, size: "thumb"),
        largeUrl: routes.image_map_photo_path(map, photo, size: "large")
      }
    end

    def before_after_pairs(photos)
      located = photos.select(&:location).index_by(&:id)
      return [] if located.size < 2
      sql = <<~SQL.squish
        SELECT a.id, b.id, ST_Distance(a.location::geography, b.location::geography)
        FROM map_photos a JOIN map_photos b ON b.map_id = a.map_id AND b.id <> a.id
        WHERE a.id = ANY($1::bigint[]) AND b.id = ANY($1::bigint[])
          AND COALESCE(b.taken_at, b.created_at) - COALESCE(a.taken_at, a.created_at) >= make_interval(days => $2::int)
          AND ST_DWithin(a.location::geography, b.location::geography, $3::float8)
        ORDER BY 3, 1, 2
      SQL
      rows = MapPhoto.connection.select_rows(sql, "dossier photo pairs",
        [ PG::TextEncoder::Array.new.encode(located.keys), BEFORE_AFTER_MIN_DAYS, MapPhoto::SAME_SPOT_METERS ])
      used = Set.new
      rows.each_with_object([]) do |(before_id, after_id, _), pairs|
        before = located[before_id.to_i]
        after = located[after_id.to_i]
        next if used.include?(before.id) || used.include?(after.id) || !same_direction?(before, after)
        used << before.id << after.id
        days = ((after.taken_at || after.created_at).to_date - (before.taken_at || before.created_at).to_date).to_i
        pairs << { beforeId: before.id, afterId: after.id, days: }
        break pairs if pairs.size >= MAX_PAIRS
      end
    end

    def same_direction?(a, b)
      return true if a.heading.nil? || b.heading.nil?
      diff = (a.heading - b.heading).abs % 360
      [ diff, 360 - diff ].min <= MapPhoto::SAME_SPOT_HEADING_DEGREES
    end

    def default_photo_ids(photos, pairs)
      ids = pairs.flat_map { |p| [ p[:beforeId], p[:afterId] ] }
      ids |= photos.select { |p| p.caption.present? }.map(&:id)
      ids |= photos.map(&:id)
      ids.first(DEFAULT_PHOTOS)
    end

    # ── Finances ─────────────────────────────────────────────────────────

    # The key figures of a saved financial plan (the finances page shows
    # them to every role; nothing when no plan was saved).
    def finances_json
      plan = map.financial_plan
      return { exists: false } unless plan&.persisted?
      indicators = plan.result.as_json["indicators"]
      {
        exists: true, updatedAt: plan.updated_at&.iso8601,
        summary: indicators.slice("totalInvestment", "breakEvenYear", "paybackYear", "fundingNeed", "finalCash", "startYear", "peakPickingHours")
          .merge("speciesCount" => plan.typed_inputs.species.size, "warningsCount" => plan.result.warnings.size)
      }
    end

    # ── Sources ──────────────────────────────────────────────────────────

    # Every data source the dossier can show, tagged with its section so
    # the page cites only those of the sections it prints.
    def sources_json
      [ *layer_sources, *relief_sources, *climate_sources, *plant_sources, *regulatory_sources ].uniq { |s| [ s[:section], s[:key] ] }
    end

    def layer_sources
      cover = [ base_layer, cadastre_layer ].compact.map { |l| layer_source(l, "cover") }
      identify = region_layers.select { |l| !l.base? && l.identifiable? }.first(MAX_IDENTIFY_LAYERS)
      terrain = identify.group_by { |l| plain(l.attribution) }.filter_map do |attribution, layers|
        next if attribution.blank?
        { section: "terrain", key: "layers-#{attribution.parameterize}", kind: "layers", label: attribution, detail: layers.map(&:name).join(", "), url: nil, license: nil }
      end
      cover + terrain
    end

    def layer_source(layer, section)
      { section:, key: "layer-#{layer.key}", kind: "layer", label: plain(layer.attribution).presence || layer.name, detail: layer.name, url: nil, license: nil }
    end

    def relief_sources
      return [] unless analyses? && map.terrain&.ready?
      metadata = map.terrain.metadata
      details = metadata.fetch("sources", {}).values.map(&:to_s).uniq
      label = plain(metadata["attribution"]).presence || details.first
      return [] if label.blank?
      [ { section: "terrain", key: "relief", kind: "relief", label:, detail: details.join(" · ").presence, url: nil, license: nil } ]
    end

    def climate_sources
      Array(climate_report["sources"]).map do |s|
        { section: "climate", key: "climate-#{s['key']}", kind: "climate", label: [ s["publisher"], s["year"] ].compact.join(", "),
          detail: s["title"], url: s["url"], license: nil }
      end
    rescue StandardError
      []
    end

    # One line per catalogue source behind the plant values shown, with
    # the fields it provides (PFAF is always cited as PFAF).
    def plant_sources
      fields_by_source = Hash.new { |h, k| h[k] = Set.new }
      licenses = {}
      field_sources_by_species.each_value do |by_field|
        PLANT_SOURCE_FIELDS.each do |group, fields|
          fields.each do |field|
            row = by_field[field] or next
            fields_by_source[row.source] << group
            licenses[row.source] ||= row.license.presence || PlantSource.default_license(row.source)
          end
        end
      end
      fields_by_source.sort_by { |source, _| source }.map do |source, groups|
        { section: "plants", key: "plants-#{source}", kind: "plant_source", label: source, detail: groups.to_a.sort.join(","),
          url: nil, license: licenses[source] }
      end
    end

    def regulatory_sources
      Array(map.region.setting(:regulatory_rules)).filter_map do |rule|
        source = rule["source"]
        next unless source.is_a?(Hash) && source["label"].present?
        { section: "alerts", key: "rule-#{source['label'].parameterize}", kind: "regulation", label: source["label"], detail: nil, url: source["url"], license: nil }
      end
    end

    # Attributions are stored as HTML (links): the dossier prints plain text.
    def plain(html)
      return nil if html.blank?
      ActionController::Base.helpers.strip_tags(html.to_s).gsub(/\s+/, " ").strip.presence
    end
end

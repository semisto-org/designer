# The water of a territory as its region's water authority publishes it,
# read for the MCP tool get_hydrography:
#
# - watercourses: each stream or river crossing the commune, with its name,
#   its legal category and who manages it (both from the region's settings,
#   `hydrography.watercourses.categories`), and its length inside;
# - runoff axes: the thalwegs where runoff concentrates (LIDAXES in
#   Wallonia), merged by class of upstream area;
# - water bodies: the official basins of the surface water bodies, with
#   their sheet;
# - sub-basins: the contributive basins of the river sectors (PARIS in
#   Wallonia, 0.5 to 20 km²: the scale the territory guide works at), each
#   with its official outline, its share inside the commune, the sector it
#   flows into, a suggested order from upstream, and a ready `basin` draft
#   for propose_territory_items.
#
# The upstream API is Providers::Hydrography; every measure (lengths,
# areas, what flows into what) is computed here, in PostGIS.
class TerritoryHydrography
  class Unavailable < StandardError; end

  # Around the commune, so a stream along its line is found whole.
  MARGIN_DEGREES = 0.005
  # Below this, a sub-basin only grazes the commune.
  MIN_INSIDE_KM2 = 0.1
  MIN_INSIDE_SHARE = 0.2
  # An outlet this close to another sub-basin flows into it.
  OUTLET_SNAP_M = 75
  SIMPLIFY_DEGREES = 0.00005
  CATEGORY_ORDER = %w[navigable category_1 category_2 category_3 unclassified undefined].freeze
  # A stream that only touches the commune line.
  MIN_LENGTH_M = 20

  def initialize(territory, provider: Providers::Hydrography.for(territory.region))
    @territory = territory
    @provider = provider
  end

  def available? = !@provider.nil?

  def call(min_runoff_class: nil, outlines: true)
    raise Unavailable, "not configured" unless available?

    @outlines = outlines
    min_class = (min_runoff_class || @provider.section("runoff_axes")&.dig("default_min_class") || 3).to_i
    {
      attribution: @provider.attribution,
      watercourses: watercourses,
      runoff_axes: runoff_axes(min_class),
      water_bodies: water_bodies,
      sub_basins: sub_basins
    }
  rescue Providers::GeoHttp::Error => e
    raise Unavailable, e.message
  end

  private
    def bbox
      west, south, east, north = @territory.bbox
      [ west - MARGIN_DEGREES, south - MARGIN_DEGREES, east + MARGIN_DEGREES, north + MARGIN_DEGREES ]
    end

    def boundary_ewkt = "SRID=4326;#{@territory.boundary.as_text}"

    # --- Watercourses -------------------------------------------------------

    def watercourses
      config = @provider.section("watercourses") || {}
      categories = config["categories"].to_h
      groups = @provider.watercourses(bbox).group_by do |feature|
        p = feature.properties
        [ p[config["category_field"]].to_s.strip, watercourse_name(p, config) ]
      end
      keys = groups.keys
      measured = clip_lines(keys.each_index.flat_map { |k| groups[keys[k]].map { |f| [ k, f.geometry ] } })
      rows = measured.filter_map do |k, length_m, geometry|
        next if length_m < MIN_LENGTH_M

        code, name = keys[k]
        atlas = groups[keys[k]].filter_map { |f| number(f.properties[config["number_field"]]) }.first
        category = categories[code] || {}
        {
          name:, category: category["key"] || code.presence, category_label: category["label"], manager: category["manager"],
          atlas_number: atlas, length_in_territory_m: length_m.round, geometry:
        }.compact
      end
      rows.sort_by { |r| [ CATEGORY_ORDER.index(r[:category]) || CATEGORY_ORDER.size, r[:name] ? 0 : 1, -r[:length_in_territory_m] ] }
    end

    # « Le » + « BOCQ » → « Le Bocq » ; « Ruisseau » + « QUARANTE DEUX MILLE -42000- » → « Ruisseau n° 42000 ».
    def watercourse_name(properties, config)
      parts = Array(config["name_fields"]).map { |field| properties[field].to_s.squish }
      article, name = parts.length > 1 ? parts : [ nil, parts.first ]
      return nil if name.blank?
      return [ article.presence, "n° #{Regexp.last_match(1)}" ].compact.join(" ") if name =~ /-(\d+)-\s*\z/

      article = nil if article&.match?(/\A\d+\z/)
      [ article.presence, titleize(name) ].compact.join(article&.end_with?("'") ? "" : " ")
    end

    SMALL_WORDS = %w[de du des la le les et au aux sur sous].freeze

    # « SAINT-MARTIN » → « Saint-Martin », « FONDS DE LEFFE » → « Fonds de Leffe ».
    def titleize(text)
      words = text.downcase.split(/(\s+)/).each_with_index.map do |word, i|
        next word if word.match?(/\A\s+\z/) || (i.positive? && SMALL_WORDS.include?(word))
        next word if i.positive? && word.match?(/\A[dl]['’]\z/)

        word.gsub(/(\A|[\-'’])(\p{L})/) { "#{Regexp.last_match(1)}#{Regexp.last_match(2).upcase}" }
      end
      words.join.sub(/(?<=\s)([DL])(['’])(?=\p{L})/) { "#{Regexp.last_match(1).downcase}#{Regexp.last_match(2)}" }
    end

    def number(value)
      n = value.to_f
      n.positive? ? n.to_i : nil
    end

    # --- Runoff axes --------------------------------------------------------

    def runoff_axes(min_class)
      config = @provider.section("runoff_axes") or return nil
      field = config["class_field"]
      features = @provider.runoff_axes(bbox, min_class:)
      classes = features.map { |f| f.properties[field].to_i }
      keys = classes.uniq.sort
      measured = clip_lines(features.each_with_index.map { |f, i| [ keys.index(classes[i]), f.geometry ] })
      {
        source: config["label"], min_class:, classes_available: config["classes"],
        truncated: (true if features.size >= Providers::Hydrography::PAGE),
        by_class: measured.map do |k, length_m, geometry|
          { class: keys[k], upstream_area: config["classes"].to_h[keys[k].to_s], count: classes.count(keys[k]), length_in_territory_m: length_m.round, geometry: }.compact
        end.sort_by { |row| -row[:class] }
      }.compact
    end

    # [[key, GeoJSON line], …] → [[key, metres inside the commune, GeoJSON inside]]
    def clip_lines(pairs)
      pairs = pairs.select { |_, geometry| geometry }
      return [] if pairs.empty?

      rows = pairs.map { |k, geometry| { k:, g: geometry.to_json } }
      sql = <<~SQL.squish
        WITH t AS (SELECT ST_GeomFromEWKT(:boundary) AS b),
        f AS (SELECT (e->>'k')::int AS k, ST_SetSRID(ST_GeomFromGeoJSON(e->>'g'), 4326) AS geom FROM jsonb_array_elements(CAST(:rows AS jsonb)) e),
        g AS (SELECT k, ST_Intersection(ST_Collect(f.geom), t.b) AS inside FROM f, t GROUP BY k, t.b)
        SELECT k, ST_Length(inside::geography) AS m, #{geometry_sql('ST_LineMerge(ST_CollectionExtract(inside, 2))')} AS g
        FROM g WHERE NOT ST_IsEmpty(inside) AND ST_Length(inside::geography) > 1
      SQL
      select_rows(sql, boundary: boundary_ewkt, rows: rows.to_json).map { |k, m, g| [ k.to_i, m.to_f, g && JSON.parse(g) ] }
    end

    def geometry_sql(expression)
      @outlines ? "ST_AsGeoJSON(ST_SimplifyPreserveTopology(#{expression}, #{SIMPLIFY_DEGREES}), 6)" : "NULL"
    end

    # --- Water bodies -------------------------------------------------------

    def water_bodies
      config = @provider.section("water_bodies") or return []
      features = @provider.water_bodies(bbox)
      measure_polygons(features).filter_map do |i, area_km2, inside_km2, geometry, _|
        next if inside_km2 < MIN_INSIDE_KM2

        p = features[i].properties
        {
          id: p[config["id_field"]], name: p[config["name_field"]], area_km2: area_km2.round(2), inside_km2: inside_km2.round(2),
          share_of_territory: share(inside_km2), sheet_url: p[config["sheet_field"]].presence, outline: geometry
        }.compact
      end.sort_by { |row| -row[:inside_km2] }
    end

    # --- Sub-basins ---------------------------------------------------------

    def sub_basins
      config = @provider.section("sub_basins") or return []
      features = @provider.sub_basins(bbox)
      ids = features.map { |f| f.properties[config["id_field"]].to_s }
      sectors = @provider.sectors(ids.uniq).index_by { |s| s.properties[config["id_field"]].to_s }
      outlets = ids.map do |id|
        s = sectors[id]&.properties || {}
        x, y = s[config["outlet_x"]].to_f, s[config["outlet_y"]].to_f
        x.positive? && y.positive? ? [ x, y ] : nil
      end
      measured = measure_polygons(features, outlets:, srid: config["outlet_srid"])
      kept = measured.select { |_, area, inside, _, _| inside >= MIN_INSIDE_KM2 || (area.positive? && inside / area >= MIN_INSIDE_SHARE) }
      kept_ids = kept.map { |i, *| ids[i] }
      flows = kept.to_h { |i, *, into| [ ids[i], (ids[into] if into && kept_ids.include?(ids[into])) ] }
      orders = suggested_orders(flows)

      rows = kept.map do |i, area_km2, inside_km2, geometry, _|
        id = ids[i]
        s = sectors[id]&.properties || {}
        watercourse = tidy_watercourse(s[config["watercourse_field"]])
        landmark = s[config["outlet_field"]].to_s.squish.presence
        into = flows[id]
        outlet = outlet_text(watercourse, landmark, into && tidy_watercourse(sectors[into]&.properties&.dig(config["watercourse_field"])))
        {
          id:, watercourse:, outlet_landmark: landmark, water_body: features[i].properties[config["water_body_field"]],
          area_km2: area_km2.round(2), inside_km2: inside_km2.round(2), share_of_territory: share(inside_km2),
          upstream_outside_km2: (area_km2 - inside_km2).round(2), flows_into: into, suggested_order: orders[id],
          outline: geometry,
          draft: draft(id, watercourse, landmark, outlet, orders[id], area_km2, inside_km2, geometry, config)
        }.compact
      end
      rows.sort_by { |row| [ row[:suggested_order] || 99, -row[:inside_km2] ] }
    end

    # « R. de CRUPET   R. de GENCE » → « R. de Crupet, R. de Gence »
    def tidy_watercourse(text)
      names = text.to_s.split(/\s{2,}/).map { |name| name.squish.gsub(/(\b[dDlL]['’])\s+/, '\\1').sub(/\AR\.\s*/, "Ruisseau ") }.reject(&:blank?)
      names.map { |name| name =~ /-(\d+)-\s*\z/ ? "#{name.split.first} n° #{Regexp.last_match(1)}" : titleize(name) }.join(", ").presence
    end

    def outlet_text(watercourse, landmark, downstream)
      return downstream if downstream && downstream != watercourse
      return I18n.t("territories.hydrography.outlet_at", watercourse:, landmark:) if watercourse && landmark

      watercourse || landmark
    end

    def draft(id, watercourse, landmark, outlet, order, area_km2, inside_km2, geometry, config)
      # Unique in the dossier: two sectors of one stream differ by their landmark, or by their code.
      title = landmark ? [ watercourse, landmark ].compact.join(" — ") : [ watercourse, "(#{id})" ].compact.join(" ")
      {
        kind: "basin", ref: id.to_s.parameterize, title:, geometry:,
        properties: { order:, outlet: }.compact,
        rationale: I18n.t("territories.hydrography.draft_rationale", source: config["label"], id:, area: format_km2(area_km2), inside: format_km2(inside_km2))
      }.compact
    end

    def format_km2(value) = ActiveSupport::NumberHelper.number_to_rounded(value, precision: 1, separator: ",")

    # 1 for a sub-basin nothing flows into, then one more at each step down.
    def suggested_orders(flows)
      upstream = Hash.new { |h, k| h[k] = [] }
      flows.each { |from, to| upstream[to] << from if to }
      memo = {}
      depth = lambda do |id, seen|
        return memo[id] if memo[id]
        return 1 if seen.include?(id)

        memo[id] = 1 + (upstream[id].map { |u| depth.(u, seen + [ id ]) }.max || 0)
      end
      flows.keys.to_h { |id| [ id, depth.(id, []) ] }
    end

    def share(inside_km2)
      total = @territory.area_m2.to_f / 1_000_000
      total.positive? ? (inside_km2 / total).round(3) : nil
    end

    # [[index, km², km² inside, GeoJSON outline, index of the polygon its outlet falls into]]
    def measure_polygons(features, outlets: nil, srid: nil)
      rows = features.each_with_index.filter_map do |f, i|
        next unless f.geometry

        { k: i, g: f.geometry.to_json, x: outlets&.dig(i, 0), y: outlets&.dig(i, 1) }
      end
      return [] if rows.empty?

      outlet = srid ? "ST_Transform(ST_SetSRID(ST_MakePoint((e->>'x')::float8, (e->>'y')::float8), #{srid.to_i}), 4326)" : "NULL::geometry"
      sql = <<~SQL.squish
        WITH t AS (SELECT ST_GeomFromEWKT(:boundary) AS b),
        f AS (
          SELECT (e->>'k')::int AS k, ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(e->>'g'), 4326)) AS geom,
                 CASE WHEN e->>'x' IS NULL THEN NULL ELSE #{outlet} END AS outlet
          FROM jsonb_array_elements(CAST(:rows AS jsonb)) e
        )
        SELECT f.k, ST_Area(f.geom::geography) / 1e6, ST_Area(ST_Intersection(f.geom, t.b)::geography) / 1e6,
               #{geometry_sql('ST_CollectionExtract(f.geom, 3)')},
               (SELECT o.k FROM f o WHERE f.outlet IS NOT NULL AND o.k <> f.k
                  AND ST_DWithin(o.geom::geography, f.outlet::geography, #{OUTLET_SNAP_M})
                ORDER BY ST_Area(ST_Intersection(o.geom, ST_Buffer(f.outlet::geography, #{OUTLET_SNAP_M})::geometry)) DESC LIMIT 1)
        FROM f, t
      SQL
      select_rows(sql, boundary: boundary_ewkt, rows: rows.to_json).map do |k, area, inside, g, into|
        [ k.to_i, area.to_f, inside.to_f, g && JSON.parse(g), into&.to_i ]
      end
    end

    def select_rows(sql, **binds)
      Territory.connection.select_rows(Territory.sanitize_sql_array([ sql, binds ]))
    end
end

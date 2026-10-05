# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
module Imports
  module Claudy
    # How a Claudy record becomes a Designer one, without touching the
    # database: a Target (layer, kind, name, notes, properties, geometry) or
    # a Skip with its reason.
    #
    #   Claudy layer       Claudy kind          Designer layer / kind
    #   management         zone · path · point  existing / zone · path_existing · point
    #   network (water…)   line · node          networks / water_pipe… · valve, meter, socket, tap or point
    #   design (3D relief) swale · keyline      water / swale · line
    #                      pond · hedge         water / pond · structures / hedge
    #   biodiversity       observation          notes / note_point (own records only)
    #   bioindicators      bioindicator         notes / note_point (+ BioindicatorObservation per species)
    #   plants (Plant)     plant                plants / plant (species_id, variety_id, planted_on)
    #   sketches           strokes              notes / sketch (MultiLineString)
    #   venues · welcome · comments             not imported
    #
    # Library defaults (a pipe of 32 mm, potable water…) are never applied to
    # imported elements: what Claudy did not say stays empty. Personal data
    # (observers, authors, analysts, UniFi devices) is never carried over.
    #
    # Claudy's vocabulary (strata, plant statuses, node types, water sources
    # and their potability) comes from its models (MapLayer, Plant,
    # MapFeature).
    module Mapping
      Target = Data.define(:layer, :kind, :name, :notes, :properties, :geometry)
      Skip = Data.define(:reason)

      GEOMETRY_TYPES = %w[Point LineString Polygon MultiLineString MultiPolygon].freeze
      WELCOME_MAP_LAYERS = %w[venues welcome].freeze
      LINE_KINDS = { "water" => "water_pipe", "electricity" => "electric_line", "ethernet" => "ethernet_line", "gas" => "gas_line" }.freeze
      NODE_KINDS = {
        "water" => { "valve" => "valve", "meter" => "meter", "tap" => "tap" },
        "electricity" => { "meter" => "meter", "outlet" => "socket" },
        "ethernet" => { "wall_jack" => "socket" },
        "gas" => { "valve" => "valve", "meter" => "meter" }
      }.freeze
      # Rain and forest catchment water is not drinkable; the well is.
      WATER_POTABILITY = { "rain" => false, "forest_catchment" => false, "well" => true }.freeze
      # The map's WaterSource each Claudy source becomes (taps are linked to it).
      WATER_SOURCES = {
        "well" => { name: "Eau de puits", potable: true },
        "rain" => { name: "Eau de pluie", potable: false },
        "forest_catchment" => { name: "Eau de captage forestier", potable: false }
      }.freeze
      PLANNED_STATUSES = %w[on_plan awaiting_planting to_place].freeze
      # Claudy strata → the strata a species plays in a Designer palette.
      STRATA = {
        "tree" => "canopy", "coppice" => "sub_canopy", "pollard" => "sub_canopy", "food_pollard" => "sub_canopy",
        "espalier" => "shrub", "shrub" => "shrub", "subshrub" => "shrub", "herbaceous" => "herbaceous",
        "climber" => "vine", "vine" => "vine", "groundcover" => "ground_cover", "aquatic" => "aquatic"
      }.freeze
      DESIGN_NUMBERS = { "width" => "width_m", "depth" => "depth_m", "berm" => "berm_m", "grade" => "grade_pct" }.freeze

      module_function

      # --- Map features -----------------------------------------------------

      def feature(row, network: nil, detail: {})
        return Skip.new(:welcome_map) if WELCOME_MAP_LAYERS.include?(row["layer_kind"])
        return Skip.new(:comments) if row["layer_kind"] == "comments"
        geometry = geometry(row["geometry"])
        return Skip.new(:no_geometry) unless geometry

        case row["layer_kind"]
        when "management" then management(row, geometry, detail)
        when "network" then network_element(row, geometry, network, detail)
        when "design" then design(row, geometry, detail)
        when "biodiversity" then observation(row, geometry, detail)
        when "bioindicators" then bioindicator(row, geometry, detail)
        when "plants" then row["feature_kind"] == "plant" ? Skip.new(:plant_point) : generic("plants", row, geometry, detail)
        when "sketch" then generic("notes", row, geometry, detail)
        else Skip.new(:unknown_layer)
        end
      end

      def management(row, geometry, detail)
        kind = { "Polygon" => "zone", "MultiPolygon" => "zone", "LineString" => "path_existing", "Point" => "point" }
               .fetch(geometry["type"]) { generic_kind(geometry) }
        props = raw_properties(row)
        target("existing", kind, row, geometry, {},
               notes: [ description(row), labelled(:management, props["management_notes"]), journal(detail) ])
      end

      def network_element(row, geometry, network, detail)
        props = raw_properties(row)
        node_type = props["node_type"].presence
        water_source = props["water_source"].presence
        values = { "network" => network }
        kind =
          if geometry["type"] == "Point"
            values["node_type"] = node_type
            NODE_KINDS.dig(network, node_type) || "point"
          elsif geometry["type"].end_with?("LineString")
            LINE_KINDS[network] || "line"
          else
            generic_kind(geometry)
          end
        if water_source
          values["water_source"] = water_source
          values["potable"] = WATER_POTABILITY[water_source] if kind == "tap"
        end
        name = own_name(row) || (node_type_label(network, node_type) if kind == "point")
        target("networks", kind, row, geometry, values, name:,
               notes: [ description(row), labelled(:instructions, props["instructions"]), water_note(water_source), journal(detail) ])
      end

      def design(row, geometry, detail)
        design = raw_properties(row)["design"].to_h
        numbers = DESIGN_NUMBERS.each_with_object({}) do |(from, to), all|
          all[to] = design[from] if design[from].is_a?(Numeric)
        end
        disabled = (I18n.t("claudy_import.notes.design_disabled") if design["enabled"] == false)
        layer, kind, values, extra =
          case design["type"]
          when "swale" then [ "water", "swale", numbers, nil ]
          when "keyline" then [ "water", "line", numbers.merge("design_type" => "keyline"), I18n.t("claudy_import.notes.keyline") ]
          when "pond" then [ "water", "pond", numbers.slice("depth_m"), nil ]
          when "hedge" then [ "structures", "hedge", numbers.slice("width_m"), nil ]
          else [ "water", generic_kind(geometry), {}, nil ]
          end
        target(layer, kind, row, geometry, values, notes: [ description(row), extra, disabled, journal(detail) ])
      end

      # An observation entered in Claudy. Those imported there from
      # observations.be are third-party data that names its observers:
      # left out (they can be read again from the source).
      def observation(row, geometry, detail)
        props = raw_properties(row)
        return Skip.new(:third_party_observation) if props["source"].present?
        realm = I18n.t("claudy_import.observations.realms.#{props['realm']}", default: "").presence
        date = format_date(props["observed_on"])
        count = Integer(props["count"].to_s, exception: false)
        summary =
          if realm && date then I18n.t("claudy_import.observations.seen_on", realm:, date:)
          elsif realm then I18n.t("claudy_import.observations.seen", realm:)
          end
        values = {
          "realm" => props["realm"].presence, "species_common" => props["species_common"].presence,
          "species_latin" => props["species_latin"].presence, "observed_on" => iso_date(props["observed_on"]),
          "count" => count&.positive? ? count : nil
        }.compact
        name = own_name(row) || props["species_common"].presence || props["species_latin"].presence
        target("notes", point_or_generic(geometry, "note_point"), row, geometry, values, name:, notes: [
          description(row), summary,
          (I18n.t("claudy_import.observations.latin", latin: values["species_latin"]) if values["species_latin"]),
          (I18n.t("claudy_import.observations.count", count:) if values["count"]),
          journal(detail)
        ])
      end

      # A bio-indicator record: a note holding the diagnosis (the species
      # themselves become BioindicatorObservations, see .bioindicator_species).
      def bioindicator(row, geometry, detail)
        props = raw_properties(row)
        analysis = props["analysis"].is_a?(Hash) ? props["analysis"] : nil
        date = format_date(props["observed_on"])
        name = own_name(row) ||
               (date ? I18n.t("claudy_import.bioindicators.name", date:) : I18n.t("claudy_import.bioindicators.name_undated"))
        values = { "observed_on" => iso_date(props["observed_on"]), "agronomy" => analysis&.dig("agronomy").presence }.compact
        analysis_notes =
          if analysis&.dig("summary").present?
            [ labelled(:summary, analysis["summary"], scope: :bioindicators), labelled(:advice, analysis["advice"], scope: :bioindicators),
              labelled(:caution, analysis["caution"], scope: :bioindicators) ]
          else
            [ I18n.t("claudy_import.bioindicators.pending") ]
          end
        target("notes", point_or_generic(geometry, "note_point"), row, geometry, values, name:,
               notes: [ description(row), *analysis_notes, journal(detail) ])
      end

      # [{ key:, species_name:, latin_name:, abundance:, observed_on:, notes: }]
      # for each species of a bio-indicator analysis.
      def bioindicator_species(row)
        props = raw_properties(row)
        species = props.dig("analysis", "species")
        return [] unless species.is_a?(Array)
        observed_on = iso_date(props["observed_on"] || props.dig("analysis", "analyzed_on"))
        species.grep(Hash).filter_map do |item|
          name = item["name"].to_s.squish.presence
          latin = item["latin_name"].to_s.squish.presence
          next unless name || latin
          confidence = I18n.t("claudy_import.bioindicators.confidence.#{item['confidence']}", default: "").presence
          {
            key: SpeciesMatcher.fold(latin || name),
            species_name: (name || latin).truncate(120),
            latin_name: latin&.truncate(160),
            abundance: BioindicatorObservation::ABUNDANCES.include?(item["abundance"]) ? item["abundance"] : "present",
            observed_on:,
            notes: join_notes([ item["note"].to_s.squish.presence, confidence ])&.truncate(2000)
          }
        end.uniq { |attrs| attrs[:key] }
      end

      def generic(layer, row, geometry, detail)
        target(layer, generic_kind(geometry), row, geometry, {}, notes: [ description(row), journal(detail) ])
      end

      # --- Plants -----------------------------------------------------------

      # `match`: SpeciesMatcher::Match or nil.
      def plant(row, match:, detail: {})
        return Skip.new(:dead_plant) if row["status"] == "dead"
        position = position([ row["longitude"], row["latitude"] ])
        return Skip.new(:unplaced_plant) unless position

        values = {}
        if match
          values["species_id"] = match.species.id
          values["variety_id"] = match.variety&.id
          values["unmatched_variety"] = match.cultivar if match.variety.nil? && match.cultivar.present?
        else
          values["unmatched_species"] = unmatched_species(row)
        end
        values.merge!(planting(row))
        values["number"] = row["number_label"].to_s.presence

        Target.new(
          layer: "plants", kind: "plant", name: plant_name(row),
          notes: join_notes([ row["notes"].to_s.strip.presence, *plant_facts(row, values), journal(detail) ]),
          properties: values.compact, geometry: { "type" => "Point", "coordinates" => position }
        )
      end

      # planted_on when the date is known; a year alone gives the 1st of
      # January of that year, marked `planted_on_precision: "year"`. Plants
      # still planned in Claudy are never marked planted.
      def planting(row)
        return {} if PLANNED_STATUSES.include?(row["status"])
        date = parse_date(row["planted_on"])
        return { "planted_on" => date.iso8601 } if date && date <= PlantableFeature.latest_today
        year = Integer(row["planted_year"].to_s, exception: false)
        return {} unless year&.between?(1800, Date.current.year)
        { "planted_on" => Date.new(year, 1, 1).iso8601, "planted_on_precision" => "year" }
      end

      def unmatched_species(row)
        species = row["species"].is_a?(Hash) ? row["species"] : {}
        variety = row["variety"].is_a?(Hash) ? row["variety"]["name"] : nil
        {
          "name" => species["name"].presence || row["display_name"].presence || row["name"].presence,
          "latin_name" => species["latin_name"].presence,
          "variety" => variety.presence
        }.compact
      end

      def plant_name(row)
        species = row["species"].is_a?(Hash) ? row["species"]["name"] : nil
        variety = row["variety"].is_a?(Hash) ? row["variety"]["name"] : nil
        base = row["name"].to_s.squish.presence || row["display_name"].to_s.squish.presence ||
               [ species, variety ].compact_blank.join(" ").presence
        number = row["number_label"].to_s.presence
        return base unless number
        base ? I18n.t("claudy_import.plants.numbered_name", number:, name: base) : I18n.t("claudy_import.plants.number_only", number:)
      end

      def plant_facts(row, values)
        status = I18n.t("claudy_import.plants.statuses.#{row['status']}", default: "").presence if row["status"].present?
        health = I18n.t("claudy_import.plants.healths.#{row['health']}", default: "").presence if row["health"].present?
        count = Integer(row["plant_count"].to_s, exception: false)
        [
          (I18n.t("claudy_import.plants.status", label: status) if status),
          (I18n.t("claudy_import.plants.health", label: health) if health),
          (I18n.t("claudy_import.plants.zone", zone: row["zone"].to_s.squish) if row["zone"].present?),
          (I18n.t("claudy_import.plants.count", count:) if count && count > 1),
          (I18n.t("claudy_import.plants.planted_year", year: values["planted_on"].to_s[0, 4]) if values["planted_on_precision"] == "year")
        ]
      end

      # The palette strata of a Claudy stratum, or nil.
      def strata(stratum) = STRATA[stratum.to_s]

      # --- Sketches ---------------------------------------------------------

      # A freehand sketch: strokes of [lat, lng] points (Leaflet order) become
      # one MultiLineString in GeoJSON order. A stroke of a single point (a
      # dot) has no length and is dropped.
      def sketch(row)
        lines = Array(row["strokes"]).grep(Hash).filter_map do |stroke|
          points = Array(stroke["points"]).filter_map { |lat_lng| lat_lng.is_a?(Array) ? position([ lat_lng[1], lat_lng[0] ]) : nil }
          points = points.chunk_while { |a, b| a == b }.map(&:first)
          points if points.size >= 2
        end
        return Skip.new(:empty_sketch) if lines.empty?
        Target.new(layer: "notes", kind: "sketch", name: row["name"].to_s.squish.presence, notes: nil,
                   properties: { "folder" => row["folder"].to_s.squish.presence }.compact,
                   geometry: { "type" => "MultiLineString", "coordinates" => lines })
      end

      # --- Geometry ---------------------------------------------------------

      # A 2D GeoJSON geometry of a supported type, or nil.
      def geometry(raw)
        return nil unless raw.is_a?(Hash) && GEOMETRY_TYPES.include?(raw["type"])
        coordinates =
          case raw["type"]
          when "Point" then position(raw["coordinates"])
          when "LineString" then path(raw["coordinates"], 2)
          when "Polygon" then rings(raw["coordinates"])
          when "MultiLineString" then many(raw["coordinates"]) { |line| path(line, 2) }
          when "MultiPolygon" then many(raw["coordinates"]) { |polygon| rings(polygon) }
          end
        coordinates && { "type" => raw["type"], "coordinates" => coordinates }
      end

      def generic_kind(geometry)
        case geometry["type"]
        when "Point" then "point"
        when "LineString", "MultiLineString" then "line"
        else "zone"
        end
      end

      def position(value)
        return nil unless value.is_a?(Array) && value.size.between?(2, 3) && value.first(2).all?(Numeric)
        lng, lat = value.first(2).map(&:to_f)
        [ lng, lat ] if lng.between?(-180, 180) && lat.between?(-90, 90)
      end

      def path(value, minimum)
        return nil unless value.is_a?(Array) && value.size >= minimum
        points = value.map { |p| position(p) }
        points if points.all?
      end

      def rings(value)
        return nil unless value.is_a?(Array) && value.any?
        rings = value.map { |ring| path(ring, 4) }
        rings if rings.all? { |ring| ring && ring.first == ring.last }
      end

      def many(value)
        return nil unless value.is_a?(Array) && value.any?
        parts = value.map { |part| yield part }
        parts if parts.all?
      end

      # --- Helpers ----------------------------------------------------------

      def target(layer, kind, row, geometry, values, notes:, name: own_name(row))
        Target.new(layer:, kind:, name:, notes: join_notes(notes), properties: element_properties(kind, values), geometry:)
      end

      # The values, plus an explicit null for every library default nobody
      # gave, so the element library does not invent a diameter or a potable
      # flag (MapFeature::Elements merges defaults under given keys only).
      def element_properties(kind, values)
        blanks = MapElements.defaults_for(kind).keys.index_with { nil }
        blanks.merge(values.compact)
      end

      def point_or_generic(geometry, kind) = geometry["type"] == "Point" ? kind : generic_kind(geometry)

      def raw_properties(row) = row["properties"].is_a?(Hash) ? row["properties"] : {}

      # The French name, else any other language's (Claudy keeps fr, en, nl).
      def own_name(row)
        names = row["name_i18n"].is_a?(Hash) ? row["name_i18n"] : {}
        (names["fr"].presence || names.values.find(&:present?)).to_s.squish.presence
      end

      def description(row)
        texts = row["description_i18n"].is_a?(Hash) ? row["description_i18n"] : {}
        (texts["fr"].presence || texts.values.find(&:present?)).to_s.strip.presence
      end

      def labelled(key, text, scope: :notes)
        text = text.to_s.strip
        I18n.t("claudy_import.#{scope}.#{key}", text:) if text.present?
      end

      # Claudy's dated notes, newest first as Claudy shows them.
      def journal(detail)
        entries = Array(detail.to_h["notes_log"]).grep(Hash).filter_map do |note|
          body = note["body"].to_s.strip
          next if body.blank?
          date = format_date(note["noted_on"])
          [ note["noted_on"].to_s, date ? I18n.t("claudy_import.notes.journal_entry", date:, body:) : body ]
        end
        return nil if entries.empty?
        [ I18n.t("claudy_import.notes.journal"), *entries.sort_by(&:first).reverse.map(&:last) ].join("\n")
      end

      def water_note(source)
        return nil unless source
        label = I18n.t("claudy_import.networks.water_sources.#{source}", default: "").presence
        return nil unless label
        [ I18n.t("claudy_import.notes.water_source", label:), (I18n.t("claudy_import.notes.non_potable") if WATER_POTABILITY[source] == false) ].compact.join(" ")
      end

      def node_type_label(network, node_type)
        return nil if node_type.blank?
        labels = I18n.t("claudy_import.networks.node_types")
        labels.dig(network&.to_sym, node_type.to_sym) || labels.values.filter_map { |types| types[node_type.to_sym] }.first
      end

      def join_notes(parts) = parts.compact.map(&:to_s).map(&:strip).reject(&:empty?).join("\n\n").presence

      def parse_date(value)
        Date.iso8601(value.to_s)
      rescue Date::Error
        nil
      end

      def iso_date(value) = parse_date(value)&.iso8601

      def format_date(value) = parse_date(value)&.strftime(I18n.t("claudy_import.date_format"))
    end
  end
end

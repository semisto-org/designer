# « Plan directeur »: the design of a map as a designer hands it over, in
# the spirit of a watercolour master plan. Every element of the project is
# numbered, theme by theme in Semisto's design order (water, then access,
# structures, animals, zones, plant groups), each with the point where its
# number is written on the plan; single plants are not numbered but
# counted by species in the palette. With the mission (the purpose of the
# project), the phase in progress and the place. The browser lays it out
# as a PDF; the MCP serves the same numbering, so an AI and the paper speak
# of « n° 7 » alike. The networks never appear.
#
# Each species of the palette has the code designers write on a plan
# (Juglans regia → « Ju re »), written by each of its plants; what is
# already there and has a name is lettered (A, B, C…), in grey; and « Le
# temps du vivant » speaks of this garden's own plants at years 5, 15, 30.
class MasterPlan
  THEMES = %w[water access structures animals drawings plants].freeze
  PALETTE_LIMIT = 40
  # Single plants written on the plan by their code: past that, a sheet is ink.
  PLANTS_LIMIT = 400
  # What already stands is lettered A to Z.
  EXISTING_LAYERS = %w[existing water access structures animals].freeze
  LETTERS = ("A".."Z").to_a.freeze
  EXISTING_LIMIT = 100
  TIME_YEARS = [ 5, 15, 30 ].freeze

  attr_reader :map

  # `team`: whether the reader may see the team's own work (the purpose of
  # the functional analysis); otherwise the person's own words are used.
  # `variant`: the variant the printed map shows (the common project and
  # it); without one, the design as retained.
  def initialize(map, team: false, variant: nil)
    @map = map
    @team = team
    @variant = variant
  end

  def as_json(*)
    { title: map.name, place: map.address.presence, phase: map.current_design_phase_name, mission:, themes:, palette:, plants:, existing:, time:, areaM2: map.area_m2 }.compact
  end

  # The project's purpose, in one or two sentences.
  def mission
    sheet = map.project_sheet
    team = sheet.section("analysis")["purpose"] if @team
    (team.presence || sheet.section("ambitions")["meaning"].presence)&.to_s&.squish
  end

  # [{ key:, items: [{ number:, id:, label:, kind:, at: [lng, lat] }] }], numbered 1..n across themes.
  def themes
    features = elements.to_a
    labels = MapFeature.labels_for(features)
    anchors = anchor_points(features.map(&:id))
    number = 0
    THEMES.filter_map do |theme|
      list = features.select { _1.layer == theme }
      next if list.empty?

      items = list.sort_by { |f| [ labels[f.id].to_s.downcase, f.id ] }.map do |f|
        number += 1
        { number:, id: f.id, label: labels[f.id], kind: f.kind, at: anchors[f.id] }.compact
      end
      { key: theme, items: }
    end
  end

  # Single plants of the project, counted by species (the most planted kept), each with its code
  # and adult height, the tallest first.
  def palette
    @palette ||= begin
      rows = planned_plants.group_by(&:plant_species_id).filter_map do |id, list|
        next unless (s = species[id])

        height = PlantGrowth.height(strata: s.default_strata, species: s).metres.to_f
        { species_id: id, name: s.common_name || s.latin_name, latin: s.latin_name, code: self.class.code(s.latin_name), count: list.size,
          heightM: (height.round(height < 3 ? 1 : 0) if height.positive?) }.compact
      end.sort_by { |row| [ -row[:count], row[:name].to_s ] }.first(PALETTE_LIMIT)
      # Read like a planting list: the tallest first, down the layers to the shrubs.
      distinct_codes(rows).sort_by { |row| [ -(row[:heightM] || 0), row[:name].to_s ] }
    end
  end

  # Where each single plant stands, with its species' code: [{ id:, code:, at: }].
  def plants
    codes = palette.to_h { [ _1[:species_id], _1[:code] ] }
    list = planned_plants.select { codes[_1.plant_species_id] }.first(PLANTS_LIMIT)
    anchors = anchor_points(list.map(&:id))
    list.filter_map { |f| { id: f.id, code: codes[f.plant_species_id], at: anchors[f.id] } if anchors[f.id] }
  end

  # What already stands and has a name (the house, the barn, the old pond), lettered A, B, C…
  # Up to EXISTING_LIMIT are listed, lettered up to Z: the printed plan letters again
  # what it draws (a hidden layer, a tag), A to Z.
  def existing
    list = design.where(layer: EXISTING_LAYERS).reject { _1.planned? || _1.removed? }.select { _1.name.present? }
      .sort_by { |f| [ EXISTING_LAYERS.index(f.layer), f.name.to_s.downcase, f.id ] }.first(EXISTING_LIMIT)
    anchors = anchor_points(list.map(&:id))
    list.each_with_index.map { |f, i| { letter: LETTERS[i], id: f.id, label: f.name.to_s.squish, kind: f.kind, at: anchors[f.id] }.compact }
  end

  # This garden's own time: [{ year:, key:, names: [...] }] — the first
  # fruits at year 5, the plants at their full size by year 15, the
  # tallest tree at year 30 (with its height in metres). The layout turns
  # them into sentences; nothing when the palette is empty.
  def time
    return [] if palette.empty?

    # Common names go mid-sentence, in lower case (« le noyer commun »); a Latin name keeps its capital.
    grown = palette.map do |row|
      s = species[row[:species_id]]
      [ row.merge(name: s.common_name.present? ? s.common_name.sub(/\A./, &:downcase) : s.latin_name), s, s.default_strata ]
    end
    fruit = grown.select { |_, s, strata| s.edible? && PlantGrowth.production_start(strata:, species: s).years <= 5 }
    adult = grown.select { |_, s, strata| %w[canopy sub_canopy].include?(strata) && PlantGrowth.maturity(strata:, species: s).years <= 15 }
    tallest = grown.max_by { |_, s, strata| PlantGrowth.height(strata:, species: s).metres.to_f }
    [
      ({ year: 5, key: "fruit", names: fruit.first(3).map { _1[0][:name] } } if fruit.any?),
      ({ year: 15, key: "adult", names: adult.first(3).map { _1[0][:name] } } if adult.any?),
      ({ year: 30, key: "tallest", names: [ tallest[0][:name] ], heightM: PlantGrowth.height(strata: tallest[2], species: tallest[1]).metres.to_f.round } if tallest)
    ].compact
  end

  # The code designers write on a plan: the first two letters of the genus
  # and of the species (Malus domestica → « Ma do »); hybrid signs and
  # abbreviations skipped. Mirrors plantCode in map/plants/labelRank.ts.
  def self.code(latin, species_letters: 2)
    words = latin.to_s.split(/\s+/).select { |w| w.match?(/\A[[:alpha:]]/) && !%w[x ×].include?(w) && !w.end_with?(".") }
    return nil if words.empty?

    genus = words[0][0, 2].capitalize
    species = words[1]&.delete_prefix("'")&.delete_prefix('"')&.[](0, species_letters)&.downcase
    species.present? ? "#{genus} #{species}" : genus
  end

  private
    # Two species of one plan never share a code: Corylus colurna and Cornus
    # controversa become « Co col » and « Co con », then « Co co 2 » if need be.
    def distinct_codes(rows)
      rows.group_by { _1[:code] }.each_value do |same|
        next if same.size < 2 || same.first[:code].nil?

        same.each { |row| row[:code] = self.class.code(row[:latin], species_letters: 3) }
        same.group_by { _1[:code] }.each_value { |still| still.each_with_index { |row, i| row[:code] = "#{row[:code]} #{i + 1}" if still.size > 1 } }
      end
      rows
    end

    def planned_plants
      @planned_plants ||= design.where(layer: "plants", kind: MapFeature::PLANT).order(:id).to_a.select(&:planned?)
    end

    def species
      @species ||= PlantSpecies.where(id: planned_plants.map(&:plant_species_id).compact.uniq).includes(:common_names).index_by(&:id)
    end

    def design
      scope = map.features.active
      @variant ? scope.where(variant_id: [ nil, @variant.id ]) : scope.in_design
    end

    # What is numbered: the project (planned or a plan's zone), not single plants, never networks.
    def elements
      scope = design.where(layer: THEMES).where.not(layer: "plants", kind: MapFeature::PLANT)
      scope.select { |f| (f.layer == "drawings" && f.kind != "bubble") || f.planned? }
    end

    # Where each number is written: halfway along a line, and on the edge of
    # an area, at its north-west corner, as one pins a number on a plan: inside
    # it would land on the crowns planted there.
    def anchor_points(ids)
      return {} if ids.empty?

      point = <<~SQL.squish
        CASE
          WHEN GeometryType(geometry) = 'LINESTRING' THEN ST_LineInterpolatePoint(geometry, 0.5)
          WHEN GeometryType(geometry) = 'POINT' THEN geometry
          WHEN GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON')
            THEN ST_ClosestPoint(ST_Boundary(geometry), ST_SetSRID(ST_MakePoint(ST_XMin(geometry), ST_YMax(geometry)), 4326))
          ELSE ST_PointOnSurface(geometry) END
      SQL
      MapFeature.where(id: ids).pluck(:id, Arel.sql("ST_X(#{point})"), Arel.sql("ST_Y(#{point})"))
        .to_h { |id, lng, lat| [ id, [ lng.to_f.round(7), lat.to_f.round(7) ] ] }
    end
end

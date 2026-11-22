# « Plan directeur »: the design of a map as a designer hands it over, in
# the spirit of a watercolour master plan. Every element of the project is
# numbered, theme by theme in Semisto's design order (water, then access,
# structures, animals, zones, plant groups), each with the point where its
# number is written on the plan; single plants are not numbered but
# counted by species in the palette. With the mission (the purpose of the
# project), the phase in progress and the place. The browser lays it out
# as a PDF; the MCP serves the same numbering, so an AI and the paper speak
# of « n° 7 » alike. The networks never appear.
class MasterPlan
  THEMES = %w[water access structures animals drawings plants].freeze
  PALETTE_LIMIT = 40

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
    { title: map.name, place: map.address.presence, phase: map.current_design_phase_name, mission:, themes:, palette:, areaM2: map.area_m2 }.compact
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

  # Single plants of the project, counted by species, most planted first.
  def palette
    plants = design.where(layer: "plants", kind: MapFeature::PLANT).to_a.select(&:planned?)
    counts = plants.group_by(&:plant_species_id).transform_values(&:size)
    species = PlantSpecies.where(id: counts.keys.compact).includes(:common_names).index_by(&:id)
    counts.filter_map do |id, count|
      next unless (s = species[id])

      { species_id: id, name: s.common_name || s.latin_name, latin: s.latin_name, count: }
    end.sort_by { |row| [ -row[:count], row[:name].to_s ] }.first(PALETTE_LIMIT)
  end

  private
    def design
      scope = map.features.active
      @variant ? scope.where(variant_id: [ nil, @variant.id ]) : scope.in_design
    end

    # What is numbered: the project (planned or a plan's zone), not single plants, never networks.
    def elements
      scope = design.where(layer: THEMES).where.not(layer: "plants", kind: MapFeature::PLANT)
      scope.select { |f| (f.layer == "drawings" && f.kind != "bubble") || f.planned? }
    end

    # Where each number is written: on the surface of an area, halfway along a line.
    def anchor_points(ids)
      return {} if ids.empty?

      point = <<~SQL.squish
        CASE GeometryType(geometry)
          WHEN 'LINESTRING' THEN ST_LineInterpolatePoint(geometry, 0.5)
          WHEN 'POINT' THEN geometry
          ELSE ST_PointOnSurface(geometry) END
      SQL
      MapFeature.where(id: ids).pluck(:id, Arel.sql("ST_X(#{point})"), Arel.sql("ST_Y(#{point})"))
        .to_h { |id, lng, lat| [ id, [ lng.to_f.round(7), lat.to_f.round(7) ] ] }
    end
end

module Mcp
  module Tools
    # « Coupe dans le temps »: the section through the land along a line
    # (Relief::Section): the ground's profile, the plants within a corridor
    # on either side with their height and crown today and at years 5, 15
    # and 30, and what the line crosses. For an AI that wants to say « at
    # year 15 the walnut's crown reaches over the swale and shades the bed
    # behind it », then open the same section in the editor.
    class GetSection < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          line: {
            type: "array", minItems: 2, maxItems: 50, description: :line,
            items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } }
          },
          corridor_m: { type: "number", minimum: 0.5, maximum: Relief::Section::MAX_CORRIDOR_M, description: :corridor_m }
        },
        required: %w[map_id line]
      )
      hints

      include PlaceAccess

      MAX_DISTANCE_M = 300

      def perform(map_id:, line:, corridor_m: Relief::Section::CORRIDOR_M)
        map = find_map!(map_id)
        line.each { |lng, lat| require_point_near!(map, lng, lat, MAX_DISTANCE_M) }
        section = Relief::Section.new(map, line:, corridor_m:).as_json
        query = { panel: "section", line: line.map { |lng, lat| "#{lng.round(7)},#{lat.round(7)}" }.join(";"), corridor: corridor_m }.to_query
        section.merge(editor_url: "#{map_url(map)}?#{query}", note: t("tools.get_section.note"))
      rescue Relief::Section::Error => error
        raise ToolError, error.message
      end

      private
        def summarize_result(data) = { plants: data[:plants].size, length_m: data[:lengthM] }
    end
  end
end

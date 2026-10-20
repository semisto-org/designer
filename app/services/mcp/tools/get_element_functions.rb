module Mcp
  module Tools
    # The element analysis of a map: what each element does, needs and gives,
    # which functions only one element serves (fragile) or none (missing), and
    # what some element needs that nothing on the place gives. Read it before
    # proposing elements, to double a fragile function first and to place an
    # element where another one's yield covers its need.
    class GetElementFunctions < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        ElementFunctions.new(find_map!(map_id)).as_json.deep_transform_keys { |k| k.to_s.underscore }
      end

      private
        def summarize_result(data) = { elements: data["entries"].size }
    end
  end
end

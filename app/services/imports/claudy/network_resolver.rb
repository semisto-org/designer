# Ported from Claudy (MIT, © 2022-2023 Fondation Les 4 Sources)
module Imports
  module Claudy
    # Which network (water, electricity, ethernet, gas) each Claudy network
    # layer holds. Claudy keeps it in `map_layers.settings.network`, which the
    # export file carries but the API does not: from the API, a layer is
    # recognised by the node types drawn on it (a « citerne » is water, a
    # « switch » ethernet). CLAUDY_NETWORK_LAYERS ("5=water,6=electric")
    # settles a layer that holds only lines or ambiguous nodes.
    #
    # The node type keys come from Claudy's MapLayer::NODE_TYPES.
    module NetworkResolver
      # Claudy key → Designer key (Designer says « electricity »).
      NETWORKS = { "water" => "water", "electric" => "electricity", "electricity" => "electricity",
                   "ethernet" => "ethernet", "gas" => "gas" }.freeze
      # Node types that belong to one network only (valve and meter are shared).
      HINTS = {
        "water" => %w[source catchment cistern manifold tap trough manhole],
        "electricity" => %w[panel outlet breaker lighting],
        "ethernet" => %w[switch access_point wall_jack router rack fiber_box],
        "gas" => %w[tank cylinder regulator boiler cooker]
      }.freeze

      module_function

      def normalize(value) = NETWORKS[value.to_s.strip.downcase]

      # { layer_id (String) => "water" | … | nil } for every network layer.
      def resolve(layers:, features:, overrides: {})
        declared = layers.each_with_object({}) do |layer, all|
          next unless layer["kind"] == "network"
          all[layer["id"].to_s] = normalize(layer.dig("settings", "network"))
        end
        network_rows = features.select { |row| row["layer_kind"] == "network" }
        network_rows.group_by { |row| row["layer_id"].to_s }.each do |layer_id, rows|
          declared[layer_id] ||= rows.filter_map { |row| normalize(row["network"]) }.first || infer(rows)
        end
        overrides.each { |layer_id, network| declared[layer_id.to_s] = normalize(network) }
        declared
      end

      # The network most of the layer's distinctive nodes point to, or nil.
      def infer(rows)
        votes = rows.filter_map do |row|
          props = row["properties"].to_h
          next "water" if props["water_source"].present?
          next "ethernet" if props["equipment"] == "unifi"
          HINTS.find { |_, types| types.include?(props["node_type"].to_s) }&.first
        end
        votes.tally.max_by { |_, count| count }&.first
      end

      # "5=water,6=electric" → { "5" => "water", "6" => "electric" }.
      def parse_overrides(value)
        return {} if value.blank?
        value.to_s.split(",").each_with_object({}) do |pair, all|
          layer_id, network = pair.split("=", 2).map { |part| part.to_s.strip }
          raise Error.new(:network_layers, value:) unless layer_id.to_s.match?(/\A\d+\z/) && normalize(network)
          all[layer_id] = network
        end
      end
    end
  end
end

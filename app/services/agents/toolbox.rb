module Agents
  # The tools a team's colleague works with: a chosen part of the MCP server's
  # tools (the same code, the same journal), called on behalf of the member
  # who asked her, on the one map of the request.
  #
  # The list is positive: a new MCP tool reaches her only when it is added
  # here. Left out on purpose: everything that reads or returns an image,
  # other maps and territories, hours, kilometres and expenses (they are a
  # person's own), photos, uploads, imports from a URL, deletions of files,
  # the offline site. Some arguments are taken away too: the networks layer,
  # ticking a task, giving a task to an address outside the map.
  class Toolbox
    READ = %w[
      get_map list_features get_feature get_region_layers identify_at_point get_site_data trace_contour get_catchment
      find_keypoints trace_parallels get_storm_observations get_season_signs get_element_functions
      search_plants get_plant get_design_guide get_help get_project_sheet get_implementation_plan
      get_soil_samples get_soil_report get_offer list_tasks list_time_entries get_project_budget list_discussion list_harvests
      list_plant_observations list_storage_readings list_documents get_document list_site_visits list_photos
    ].freeze
    PROPOSE = %w[
      propose_features propose_sectors propose_zones propose_feature_updates propose_deletions propose_palette
      propose_project_sheet propose_phases propose_presentation_slides propose_bioindicators propose_soil_results
      propose_offer_letter withdraw_draft
    ].freeze
    WRITE = %w[create_tasks update_tasks add_document update_document update_palette_budget].freeze
    NAMES = (READ + PROPOSE + WRITE).freeze

    # Arguments she never gets, at the top level of a tool…
    WITHHELD = %i[include_networks territory_id].freeze
    # …and in each line of the task tools.
    WITHHELD_TASK_FIELDS = %i[completed assignee_email].freeze
    RESULT_MAX = 60_000

    Result = Data.define(:text, :error)

    def self.tool_classes
      @tool_classes ||= Mcp::Tools.all.select { NAMES.include?(_1.name_value) }.index_by(&:name_value)
    end

    def initialize(agent:, user:, map:, origin:)
      @map = map
      @context = {
        principal: Mcp::Principal.new(user:, scopes: [ AiAccess::READ, AiAccess::DRAFTS ], client_name: agent.name, credential: agent),
        origin:
      }
    end

    # As the Messages API takes them; the last one carries the cache mark, so
    # the whole list is read from the cache from the second turn on.
    def definitions
      @definitions ||= begin
        tools = self.class.tool_classes.values.map do |tool|
          { name: tool.name_value, description: tool.description_value, input_schema: schema(tool) }
        end
        tools.last[:cache_control] = { type: "ephemeral" } if tools.any?
        tools
      end
    end

    def call(name, input)
      tool = self.class.tool_classes[name.to_s]
      return failure(I18n.t("agents.tool_errors.unknown", name:)) unless tool
      arguments = sanitize(tool, input)
      return failure(I18n.t("agents.tool_errors.other_map", id: @map.id)) if arguments.key?(:map_id) && arguments[:map_id].to_i != @map.id

      schema = tool.input_schema_value
      missing = schema.missing_required_arguments?(arguments) ? schema.missing_required_arguments(arguments) : []
      return failure(I18n.t("agents.tool_errors.missing", fields: missing.join(", "))) if missing.any?
      schema.validate_arguments(arguments)

      response = tool.call(server_context: @context, **arguments)
      text = response.content.select { _1[:type] == "text" }.map { _1[:text] }.join("\n")
      Result.new(text: text.truncate(RESULT_MAX), error: response.error?)
    rescue MCP::Tool::InputSchema::ValidationError, ArgumentError => e
      failure(e.message.truncate(500))
    end

    private
      def failure(message) = Result.new(text: message, error: true)

      def sanitize(tool, input)
        arguments = (input || {}).to_h.deep_symbolize_keys.except(*WITHHELD)
        if %w[create_tasks update_tasks].include?(tool.name_value) && arguments[:tasks].is_a?(Array)
          arguments[:tasks] = arguments[:tasks].map { |line| line.is_a?(Hash) ? line.except(*WITHHELD_TASK_FIELDS) : line }
        end
        arguments
      end

      # The tool's own schema, without what she never gets.
      def schema(tool)
        schema = tool.localized_schema.deep_dup
        schema[:properties] = schema[:properties].except(*WITHHELD)
        if %w[create_tasks update_tasks].include?(tool.name_value)
          items = schema.dig(:properties, :tasks, :items)
          items[:properties] = items[:properties].except(*WITHHELD_TASK_FIELDS) if items
        end
        schema
      end
  end
end

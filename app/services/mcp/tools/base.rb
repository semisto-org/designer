module Mcp
  module Tools
    # Base of the MCP tools. A tool declares its JSON Schema (strict: no
    # extra properties) with Symbol descriptions; titles and descriptions
    # come from config/locales/mcp.fr.yml, so the tools/list answer and the
    # public documentation (/docs/mcp) always say the same thing.
    #
    # Every call is written to the AI journal (AiAction): the tool, a
    # summary of its arguments, counts of what it returned, the client.
    class Base < MCP::Tool
      HINT_DEFAULTS = { read_only: true, destructive: false, idempotent: true, open_world: false }.freeze

      class << self
        # :read (any connection), :propose (drafts scope, editor, owner's
        # plan) or :withdraw (drafts scope, editor).
        def requirement(value = nil)
          value ? @requirement = value : (@requirement || :read)
        end

        def arguments(schema)
          @arguments_schema = schema
        end

        def arguments_schema
          @arguments_schema || { properties: {} }
        end

        def hints(**values)
          @hints = HINT_DEFAULTS.merge(values)
        end

        def description_value = I18n.t("mcp.tools.#{name_value}.description")
        def title_value = I18n.t("mcp.tools.#{name_value}.title")

        def annotations_value
          h = @hints || HINT_DEFAULTS
          MCP::Tool::Annotations.new(
            title: title_value, read_only_hint: h[:read_only], destructive_hint: h[:destructive],
            idempotent_hint: h[:idempotent], open_world_hint: h[:open_world]
          )
        end

        def input_schema_value
          @input_schemas ||= {}
          @input_schemas[I18n.locale] ||= MCP::Tool::InputSchema.new(localized_schema)
        end

        def localized_schema
          localize({ type: "object", additionalProperties: false }.merge(arguments_schema))
        end

        def call(server_context: nil, **arguments)
          new(server_context).run(arguments)
        end

        private
          def localize(node)
            case node
            when Hash then node.to_h { |k, v| [ k, k == :description && v.is_a?(Symbol) ? describe(v) : localize(v) ] }
            when Array then node.map { |v| localize(v) }
            else node
            end
          end

          def describe(key)
            I18n.t("mcp.tools.#{name_value}.params.#{key}", default: :"mcp.params.#{key}")
          end
      end

      attr_reader :principal, :origin

      def initialize(server_context)
        @principal = server_context[:principal]
        @origin = server_context[:origin]
      end

      def run(arguments)
        data = perform(**arguments)
        log!("ok", arguments, data)
        MCP::Tool::Response.new(content_for(data), structured_content: data)
      rescue ToolError => e
        log!("error", arguments, nil, e.message)
        MCP::Tool::Response.new([ { type: "text", text: e.message } ], error: true)
      rescue StandardError => e
        log!("error", arguments, nil, "internal_error")
        raise e
      end

      private
        def user = principal.user
        def t(key, **options) = I18n.t("mcp.#{key}", **options)
        def map_url(map) = "#{origin}/maps/#{map.id}"

        # The map, when the user has a role on it (owner, editor, viewer).
        def find_map!(id)
          map = Map.active.includes(:region).find_by(id:)
          role = map&.role_for(user)
          raise ToolError, t("errors.map_not_found", id:) unless role
          @map = map
          @role = role
          map
        end

        def editor? = %w[owner editor].include?(@role)

        # Sensitive layers (networks) are hidden unless an editor asks.
        def networks_visible?(requested)
          requested && editor?
        end

        def require_drafts_scope!
          raise ToolError, t("errors.scope_drafts") unless principal.drafts?
        end

        def require_editor!
          raise ToolError, t("errors.editor_only") unless editor?
        end

        def require_ai_drafts_plan!(map)
          raise ToolError, t("errors.plan_drafts") unless Entitlements.for_map(map).ai_drafts?
        end

        def feature_json(feature, geometry: true)
          {
            type: "Feature",
            id: feature.id,
            geometry: geometry ? Geo.encode(feature.geometry) : nil,
            properties: feature.properties.except(*MapFeature.column_names).merge(
              "layer" => feature.layer, "kind" => feature.kind, "name" => feature.name, "notes" => feature.notes,
              "status" => feature.status, "source" => feature.source, "rationale" => feature.rationale,
              "tags" => feature.tags.presence, "updated_at" => feature.updated_at&.iso8601
            ).compact
          }
        end

        # What the client reads: the data as JSON text. A tool that returns an
        # image adds it here (override).
        def content_for(data) = [ { type: "text", text: JSON.generate(data) } ]

        # What goes in the journal: override for large or sensitive arguments.
        def summarize_arguments(arguments)
          arguments.transform_values { |v| v.is_a?(String) ? v.first(200) : v }
        end

        # Counts of what the call returned: override per tool.
        def summarize_result(_data) = {}

        def log!(status, arguments, data, error = nil)
          AiAction.create!(
            user:, map: @map, tool: self.class.name_value, status:,
            arguments: summarize_arguments(arguments),
            result: data ? summarize_result(data) : {},
            error_message: error&.first(500),
            client_name: principal.client_name&.first(100), credential_type: principal.credential_type
          )
        rescue StandardError => e
          Rails.error.report(e, handled: true, context: { mcp_tool: self.class.name_value })
        end
    end
  end
end

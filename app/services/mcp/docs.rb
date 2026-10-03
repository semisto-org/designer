module Mcp
  # The public reference of the MCP tools (/docs/mcp), generated from the
  # tool classes themselves (names, localized descriptions, JSON Schema),
  # so the documentation cannot drift from what the server answers.
  module Docs
    def self.tools
      Tools.all.map do |tool|
        schema = tool.localized_schema
        annotations = tool.annotations_value
        {
          name: tool.name_value,
          title: tool.title_value,
          description: tool.description_value,
          requirement: tool.requirement.to_s,
          readOnly: annotations.read_only_hint,
          parameters: parameters(schema)
        }
      end
    end

    def self.parameters(schema, prefix = nil)
      required = Array(schema[:required]).map(&:to_s)
      (schema[:properties] || {}).flat_map do |name, spec|
        full = [ prefix, name ].compact.join(".")
        row = {
          name: full,
          type: type_label(spec),
          required: required.include?(name.to_s),
          description: spec[:description],
          enum: spec[:enum] || spec.dig(:items, :enum),
          default: spec[:default],
          constraints: constraints(spec)
        }.compact
        nested = spec[:type] == "array" && spec.dig(:items, :properties) ? parameters(spec[:items], "#{full}[]") : []
        [ row ] + nested
      end
    end

    def self.type_label(spec)
      case spec[:type]
      when "array" then "array<#{spec.dig(:items, :type) || 'any'}>"
      else spec[:type].to_s
      end
    end

    CONSTRAINT_KEYS = %i[minimum maximum minLength maxLength minItems maxItems maxProperties pattern].freeze

    def self.constraints(spec)
      spec.slice(*CONSTRAINT_KEYS).presence
    end
  end
end

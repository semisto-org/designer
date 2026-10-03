module Mcp
  # Calls a method of a provider built by another part of the app, matching
  # its parameters by name (layer:, lng:, lat:…), so the MCP keeps working
  # whatever exact signature the provider settles on. Raises Mismatch when a
  # required parameter has no known value.
  module FlexibleCall
    class Mismatch < StandardError; end

    def self.invoke(callable, values)
      positional, keywords = arguments_for(callable.parameters, values)
      callable.call(*positional, **keywords)
    end

    def self.instantiate(klass, values)
      positional, keywords = arguments_for(klass.instance_method(:initialize).parameters, values)
      klass.new(*positional, **keywords)
    end

    def self.arguments_for(parameters, values)
      positional = []
      keywords = {}
      optional_open = true
      parameters.each do |type, name|
        case type
        when :req
          raise Mismatch, "missing #{name}" unless values.key?(name)
          positional << values[name]
        when :opt
          optional_open &&= values.key?(name)
          positional << values[name] if optional_open
        when :keyreq
          raise Mismatch, "missing #{name}" unless values.key?(name)
          keywords[name] = values[name]
        when :key
          keywords[name] = values[name] if values.key?(name)
        end
      end
      [ positional, keywords ]
    end
  end
end

# A tiny typed schema for jsonb documents that users (or agents) write:
# every key is declared with a type, anything undeclared is dropped and
# anything of the wrong type or outside its list is reported, never stored.
#
# Used by ProjectSheet (the project sheet of a map) and ServiceRequest
# (payloads of the requests to Semisto). The same declaration is sent to the
# frontend (`#as_json`), which renders the forms from it.
module TypedSchema
  TYPES = %i[text enum multi integer boolean list].freeze

  # `values`: allowed values (enum, multi). `range`: allowed numbers (integer).
  # `limit`: max characters (text). `max`: max entries (list). `exclusive`:
  # values that cannot be combined with others (multi: "none", "unknown").
  # `item`: the fields of one entry (list). `required`: an entry without it
  # is dropped (list items). `counts`: counts toward completion (sheet only).
  # `hidden`: carried along but never shown in forms (technical ids).
  Field = Data.define(:key, :type, :values, :range, :limit, :max, :exclusive, :item, :required, :counts, :hidden) do
    def initialize(key:, type:, values: nil, range: nil, limit: nil, max: nil, exclusive: [], item: nil, required: false, counts: true, hidden: false)
      super
    end

    def as_json(*)
      { key:, type: type.to_s, counts: }.tap do |json|
        json[:values] = values if values
        json[:range] = [ range.begin, range.end ] if range
        json[:limit] = limit if limit
        json[:max] = max if max
        json[:exclusive] = exclusive if exclusive.any?
        json[:item] = item.map(&:as_json) if item
        json[:required] = true if required
        json[:hidden] = true if hidden
      end
    end
  end

  module_function

  def text(key, limit: 2_000, required: false, counts: false) = Field.new(key:, type: :text, limit:, required:, counts:)
  def enum(key, *values, required: false, counts: true) = Field.new(key:, type: :enum, values: values.map(&:to_s).freeze, required:, counts:)
  def multi(key, *values, exclusive: [], counts: true) = Field.new(key:, type: :multi, values: values.map(&:to_s).freeze, exclusive: Array(exclusive).map(&:to_s), counts:)
  def integer(key, range, required: false, counts: true, hidden: false) = Field.new(key:, type: :integer, range:, required:, counts:, hidden:)
  def boolean(key, counts: false) = Field.new(key:, type: :boolean, counts:)
  def list(key, item, max: 20, counts: true) = Field.new(key:, type: :list, item: item.freeze, max:, counts:)

  # Coerces raw input against fields. Strict mode records an error for every
  # value that does not fit; lenient mode (reading stored data) silently
  # drops it. Blank values come back as nil: "cleared".
  class Coercer
    attr_reader :errors

    def initialize(strict:)
      @strict = strict
      @errors = {}
    end

    # Only the keys present in `raw` and declared in `fields` are returned.
    def hash(fields, raw, path = nil)
      raw = normalize_hash(raw)
      if raw.nil?
        error(path, :not_a_hash)
        return {}
      end
      fields.each_with_object({}) do |field, out|
        next unless raw.key?(field.key)
        out[field.key] = value(field, raw[field.key], [ path, field.key ].compact.join("."))
      end
    end

    def value(field, raw, path)
      return nil if blank?(raw)
      case field.type
      when :text then text(field, raw, path)
      when :enum then enum(field, raw, path)
      when :multi then multi(field, raw, path)
      when :integer then integer(field, raw, path)
      when :boolean then boolean(raw)
      when :list then list(field, raw, path)
      end
    end

    private
      def blank?(raw)
        raw.nil? || (raw.respond_to?(:empty?) && raw.empty?) || (raw.is_a?(String) && raw.strip.empty?)
      end

      def error(path, code)
        @errors[path.to_s] = code if @strict
      end

      def normalize_hash(raw)
        raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
        raw.is_a?(Hash) ? raw.deep_stringify_keys : nil
      end

      def text(field, raw, path)
        return error(path, :not_a_string) unless raw.is_a?(String)
        string = raw.delete("\u0000").gsub("\r\n", "\n").strip
        return error(path, :too_long) if string.length > field.limit
        string
      end

      def enum(field, raw, path)
        return error(path, :not_a_string) unless raw.is_a?(String)
        field.values.include?(raw) ? raw : error(path, :inclusion)
      end

      def multi(field, raw, path)
        return error(path, :not_a_list) unless raw.is_a?(Array)
        invalid = raw.reject { |v| v.is_a?(String) && field.values.include?(v) }
        error(path, :inclusion) if invalid.any?
        chosen = field.values & raw.grep(String)   # canonical order, no duplicates
        exclusive = chosen & field.exclusive
        chosen = [ exclusive.first ] if exclusive.any?
        chosen.presence
      end

      def integer(field, raw, path)
        number = case raw
        when Integer then raw
        when Float then raw.finite? && raw == raw.floor ? raw.to_i : nil
        when String then raw.strip.match?(/\A-?\d+\z/) ? raw.strip.to_i : nil
        end
        return error(path, :not_an_integer) if number.nil?
        return error(path, :out_of_range) unless field.range.cover?(number)
        number
      end

      def boolean(raw)
        ActiveModel::Type::Boolean.new.cast(raw) == true ? true : nil
      end

      def list(field, raw, path)
        return error(path, :not_a_list) unless raw.is_a?(Array)
        error(path, :too_many) if raw.size > field.max
        entries = raw.first(field.max).each_with_index.filter_map do |entry, index|
          cleaned = hash(field.item, entry, "#{path}.#{index}").compact
          required = field.item.select(&:required)
          cleaned if cleaned.any? && required.all? { |f| cleaned.key?(f.key) }
        end
        entries.presence
      end
  end

  # Does a stored/coerced value count as an answer?
  def answered?(value)
    !(value.nil? || value == false || (value.respond_to?(:empty?) && value.empty?))
  end
end

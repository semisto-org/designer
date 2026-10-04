# The element library of the map editor (config/map_elements.yml): for each
# design layer, the kinds one can draw (pond, swale, fence, paddock…), their
# geometry type and their editable properties. The drawing toolbar and the
# inspector read the same file; here it validates what reaches the database.
#
# Kinds known to the library are checked strictly (layer, geometry type,
# property types and ranges). Kinds owned by other modules (plants and
# patches, generic shapes) pass through with a well-formed name only, so the
# library never blocks them.
class MapElements
  SOURCE = Rails.root.join("config/map_elements.yml")
  KIND_FORMAT = /\A[a-z][a-z0-9_]{0,49}\z/
  FIELD_TYPES = %w[number integer select boolean text].freeze
  TEXT_MAX = 200

  Field = Data.define(:key, :type, :unit, :min, :max, :options, :readonly) do
    def self.from(hash)
      new(
        key: hash.fetch("key"), type: hash.fetch("type"), unit: hash["unit"],
        min: hash["min"], max: hash["max"], options: Array(hash["options"]).map(&:to_s),
        readonly: hash["readonly"] == true
      )
    end
  end

  Element = Data.define(:kind, :layer, :geometries, :defaults, :fields, :pickable) do
    def field(key) = fields.find { |f| f.key == key.to_s }
  end

  class << self
    def elements
      @elements ||= load_elements
    end

    def find(kind)
      elements[kind.to_s]
    end

    def layers
      catalog.fetch("layers").keys
    end

    def kinds_for(layer)
      elements.values.select { |e| e.layer == layer.to_s }.map(&:kind)
    end

    # Default properties for a new feature of this kind.
    def defaults_for(kind)
      find(kind)&.defaults || {}
    end

    def catalog
      @catalog ||= YAML.safe_load_file(SOURCE)
    end

    def reload!
      @catalog = @elements = nil
    end

    # Adds errors to a MapFeature that does not match the library.
    def validate(feature)
      return feature.errors.add(:base, :element_kind_format, message: I18n.t("drawing.errors.kind_format")) unless feature.kind.to_s.match?(KIND_FORMAT)

      element = find(feature.kind)
      return unless element

      if feature.layer != element.layer
        feature.errors.add(:base, :element_layer, message: I18n.t("drawing.errors.wrong_layer",
          kind: label(element.kind), layer: I18n.t("editor.layers.#{element.layer}")))
      end
      validate_geometry(feature, element)
      validate_properties(feature, element)
    end

    def label(kind)
      I18n.t("editor.kinds.#{kind}", default: kind.to_s.humanize)
    end

    private
      def load_elements
        catalog.fetch("layers").each_with_object({}) do |(layer, config), all|
          (config["elements"] || {}).each do |kind, spec|
            raise ArgumentError, "duplicate element kind #{kind}" if all.key?(kind)
            fields = Array(spec["fields"]).map { |f| Field.from(f) }
            fields.each { |f| raise ArgumentError, "#{kind}.#{f.key}: unknown type #{f.type}" unless FIELD_TYPES.include?(f.type) }
            all[kind] = Element.new(
              kind:, layer:,
              geometries: Array(spec.fetch("geometry")),
              defaults: (spec["defaults"] || {}).freeze,
              fields: fields.freeze,
              pickable: spec.fetch("pickable", true)
            )
          end
        end.freeze
      end

      def validate_geometry(feature, element)
        type = feature.geometry&.geometry_type&.type_name
        return if type.nil? || element.geometries.include?(type)
        feature.errors.add(:base, :element_geometry, message: I18n.t("drawing.errors.wrong_geometry",
          kind: label(element.kind), expected: element.geometries.map { |g| I18n.t("drawing.geometries.#{g}") }.to_sentence))
      end

      def validate_properties(feature, element)
        (feature.properties || {}).each do |key, value|
          field = element.field(key)
          next if field.nil? || value.nil? || value == ""
          next if valid_value?(field, value)
          feature.errors.add(:base, :element_property, message: invalid_message(field, element))
        end
      end

      def valid_value?(field, value)
        case field.type
        when "number" then value.is_a?(Numeric) && value.to_f.finite? && in_range?(field, value)
        when "integer" then value.is_a?(Integer) && in_range?(field, value)
        when "select" then field.options.include?(value.to_s)
        when "boolean" then value == true || value == false
        when "text" then value.is_a?(String) && value.length <= TEXT_MAX
        end
      end

      def in_range?(field, value)
        (field.min.nil? || value >= field.min) && (field.max.nil? || value <= field.max)
      end

      def french_number(value)
        return "—" if value.nil?
        ActiveSupport::NumberHelper.number_to_rounded(value, precision: 3, delimiter: " ", separator: ",", strip_insignificant_zeros: true)
      end

      def invalid_message(field, element)
        name = I18n.t("drawing.fields.#{field.key}", default: field.key.humanize)
        if %w[number integer].include?(field.type) && (field.min || field.max)
          I18n.t("drawing.errors.out_of_range", field: name, kind: label(element.kind),
            min: french_number(field.min), max: french_number(field.max), unit: field.unit.to_s)
        else
          I18n.t("drawing.errors.invalid_value", field: name, kind: label(element.kind))
        end
      end
  end
end

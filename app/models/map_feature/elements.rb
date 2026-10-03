# Ties a MapFeature to the element library (MapElements): known kinds get
# their default properties on creation and are validated against the
# library (layer, geometry type, property types and ranges).
module MapFeature::Elements
  extend ActiveSupport::Concern

  included do
    before_validation :apply_element_defaults, on: :create
    validate { MapElements.validate(self) }
  end

  def element
    MapElements.find(kind)
  end

  private
    def apply_element_defaults
      defaults = MapElements.defaults_for(kind)
      self.properties = defaults.merge(properties || {}) if defaults.any?
    end
end

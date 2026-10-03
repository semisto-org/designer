module Providers
  # Which elevation provider serves a region's relief. The region's settings
  # (`settings["relief"]`, seeded for Wallonia) name the provider and its
  # service URLs; a region without them has no relief yet, and the editor
  # says so instead of failing.
  #
  # A provider answers:
  # - `label`, `attribution`, `dataset?(key)`, `dataset_label(key)`;
  # - `sample(key, points, extent)` → one value per EPSG:3857 point, in order
  #   (Float metres for :terrain/:surface, Integer class for :landcover, nil
  #   for no data);
  # - `texture(extent, width:, height:)` → JPEG bytes of the ortho photo.
  module Elevation
    PROVIDERS = {
      "arcgis_identify" => "Providers::ArcgisIdentify"
    }.freeze

    module_function

    def for(region, **options)
      config = region&.setting(:relief)
      return nil unless config.is_a?(Hash)

      klass = PROVIDERS[config["provider"]]&.constantize
      return nil unless klass

      provider = klass.new(config, **options)
      provider.dataset?(:terrain) ? provider : nil
    end

    def available?(region) = self.for(region).present?
  end
end

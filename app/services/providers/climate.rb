module Providers
  # Weather and climate data behind one small interface
  # (Providers::Climate::Provider), so that a source can change without
  # touching the rest of the app.
  #
  # Each capability is served by its own provider, chosen per region
  # (regions.settings["climate"]["providers"]) and overridable by ENV:
  #
  #   normals      CLIMATE_NORMALS_PROVIDER      default "static"
  #   projections  CLIMATE_PROJECTIONS_PROVIDER  default "static"
  #   forecast     CLIMATE_FORECAST_PROVIDER     default "open_meteo"
  #
  # "static" reads the region's seeded reference data, "open_meteo" calls
  # the COMMERCIAL Open-Meteo API (OPEN_METEO_API_KEY; the free API is not
  # allowed for commercial use and is never called), "unavailable" turns
  # the capability off. A provider that is not configured answers
  # "unavailable" and the UI says so instead of failing.
  module Climate
    CAPABILITIES = %i[normals projections forecast].freeze
    DEFAULTS = { normals: "static", projections: "static", forecast: "open_meteo" }.freeze

    def self.for(region, env: ENV)
      settings = region&.setting("climate", "providers") || {}
      chosen = CAPABILITIES.index_with do |capability|
        env["CLIMATE_#{capability.upcase}_PROVIDER"].presence || settings[capability.to_s].presence || DEFAULTS[capability]
      end
      Composite.new(**chosen.to_h { |capability, name| [ capability, build(name, region, env) ] })
    end

    def self.build(name, region, env)
      case name.to_s
      when "static" then Static.new(region)
      when "open_meteo" then OpenMeteo.from_env(env)
      when "unavailable", "none" then Unavailable.new
      else
        Rails.logger.warn("[climate] unknown provider #{name.inspect}, using unavailable")
        Unavailable.new
      end
    end
  end
end

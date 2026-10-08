# Official weather stations near a map, and what they measured in the last
# days, behind one small interface:
#
#   stations = Providers::WeatherStations.for(map.region)
#   stations.configured?                 # false when the region has no provider
#   stations.stations                    # => Result with [Station, ...]
#   stations.daily(code, since: date)    # => Result with [DailyObservation, ...]
#   stations.attribution                 # { name:, url:, licence: }
#
# Results are Providers::Climate::Result (reasons: not_configured,
# no_location, upstream_error), so the UI says why there is no data
# instead of failing.
#
# The provider is chosen per region (regions.settings["weather_stations"]
# ["provider"]), overridable by ENV WEATHER_STATIONS_PROVIDER:
#
#   irm    Belgian Royal Meteorological Institute open data (CC BY 4.0),
#          IRM_OPENDATA_URL (default https://opendata.meteo.be/service)
#   none   no stations (the default)
module Providers
  module WeatherStations
    # A station. `daily` is true when the provider publishes daily
    # observations for it (only those can be asked for #daily).
    Station = Data.define(:code, :name, :lng, :lat, :altitude_m, :networks, :daily)

    # One day at one station. Temperatures in °C, rain in mm, sunshine in hours.
    DailyObservation = Data.define(:date, :tmin_c, :tmax_c, :tavg_c, :precip_mm, :soil_temp_10cm_c, :sun_hours)

    PROVIDERS = { "irm" => "Providers::WeatherStations::Irm" }.freeze

    def self.for(region, env: ENV)
      name = env["WEATHER_STATIONS_PROVIDER"].presence || region&.setting("weather_stations", "provider")
      klass = PROVIDERS[name.to_s]
      return Unavailable.new if klass.nil?

      klass.constantize.from_env(env)
    end

    # No provider for this region: every call answers not_configured.
    class Unavailable
      def key = "none"
      def configured? = false
      def attribution = nil
      def stations = Providers::Climate::Result.unavailable(:not_configured, provider: key)
      def daily(_code, since:) = stations
    end
  end
end

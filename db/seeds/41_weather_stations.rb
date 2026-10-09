# Official weather stations per region (Providers::WeatherStations). Wallonia
# reads the Belgian IRM open data; other regions have none yet. Set only when
# absent, so that an admin's choice is never overwritten.
{ "wallonia" => "irm" }.each do |key, provider|
  region = Region.find_by(key:)
  next unless region
  next if region.settings.dig("weather_stations", "provider").present?

  region.update!(settings: region.settings.merge("weather_stations" => { "provider" => provider }))
end

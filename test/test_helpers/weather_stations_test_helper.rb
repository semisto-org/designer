# WebMock stubs of the IRM open data WFS services, from real answers
# captured in test/fixtures/files/weather_stations/.
module WeatherStationsTestHelper
  IRM_AWS = %r{\Ahttps://opendata\.meteo\.be/service/aws/wfs}
  IRM_SYNOP = %r{\Ahttps://opendata\.meteo\.be/service/synop/wfs}

  def use_irm!(region = regions(:wallonia))
    region.update!(settings: region.settings.merge("weather_stations" => { "provider" => "irm" }))
    region
  end

  def stub_irm_stations
    stub_request(:get, IRM_AWS).with(query: hash_including("typenames" => "aws:aws_station")).to_return(irm_json("aws_station.json"))
    stub_request(:get, IRM_SYNOP).with(query: hash_including("typenames" => "synop:synop_station")).to_return(irm_json("synop_station.json"))
  end

  # Daily observations of Dourbes (6455), 2026-09-08 to 2026-10-07.
  def stub_irm_daily
    stub_request(:get, IRM_AWS).with(query: hash_including("typenames" => "aws:aws_1day")).to_return(irm_json("aws_1day_6455.json"))
  end

  def irm_json(name)
    { status: 200, body: file_fixture("weather_stations/#{name}").read, headers: { "Content-Type" => "application/json;charset=UTF-8" } }
  end

  def with_memory_cache
    previous = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
    yield
  ensure
    Rails.cache = previous
  end
end

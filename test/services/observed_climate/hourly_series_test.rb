require "test_helper"

class ObservedClimate::HourlySeriesTest < ActiveSupport::TestCase
  def series = ObservedClimate::HourlySeries.new(first_year: 1995, last_year: 1995)

  test "folds hours into days: kelvin to °C, metres to mm, midnight rain to the day before" do
    days = series.read_file(file_fixture("observed_climate/era5_land_two_days.csv")).days
    assert_equal [ Date.new(1995, 1, 1), Date.new(1995, 1, 2) ], days.map(&:date)

    first = days.first
    assert_in_delta(-2.0, first.tmin, 0.001)
    assert_in_delta 3.75, first.tmax, 0.001
    assert_in_delta 0.875, first.tmean, 0.001
    # 06:00, 12:00, 18:00 on the 1st, plus 00:00 on the 2nd; 00:00 on the 1st fell on 31 December 1994.
    assert_in_delta 2.0, first.precip_mm, 0.001
    assert_in_delta 1.5, days.last.precip_mm, 0.001
  end

  test "reads a zip holding one CSV per variable, and °C columns as they are" do
    Tempfile.create([ "era5", ".zip" ]) do |file|
      Zip::OutputStream.open(file.path) do |zip|
        zip.put_next_entry("reanalysis-era5-land-timeseries-2m_temperature.csv")
        zip.write("valid_time,latitude,longitude,t2m\n1995-03-01T00:00:00,50.3,4.9,-1.5\n1995-03-01T12:00:00,50.3,4.9,8.5\n")
        zip.put_next_entry("reanalysis-era5-land-timeseries-total_precipitation.csv")
        zip.write("valid_time,latitude,longitude,tp\n1995-03-01T12:00:00,50.3,4.9,0.004\n1995-03-01T13:00:00,50.3,4.9,nan\n")
        zip.put_next_entry("README.txt")
        zip.write("ignored")
      end
      day = series.read_file(file.path).days.sole
      assert_equal Date.new(1995, 3, 1), day.date
      assert_equal [ -1.5, 8.5, 3.5 ], [ day.tmin, day.tmax, day.tmean ]
      assert_in_delta 4.0, day.precip_mm, 0.001
    end
  end

  test "drops days outside the period and refuses a file without a time column" do
    csv = "valid_time,t2m\n1994-12-31 23:00:00,270\n1996-01-01 00:00:00,270\n"
    assert_empty series.read_csv(StringIO.new(csv)).days
    assert_raises(Providers::Era5Land::Error) { series.read_csv(StringIO.new("when,t2m\nx,1\n")) }
  end
end

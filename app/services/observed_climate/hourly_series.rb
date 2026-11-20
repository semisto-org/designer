require "csv"
require "zip"

class ObservedClimate
  # Folds the hourly ERA5-Land series returned by the CDS (a CSV, or a zip
  # holding one CSV per variable) into days, reading row by row: thirty
  # years of hours are ~263,000 rows per variable and never sit in memory,
  # only the ~11,000 days they fold into.
  #
  # Columns are found by name: time ("valid_time", "time" or "date"), 2 m
  # temperature ("t2m" or "2m_temperature", kelvin or °C) and precipitation
  # ("tp" or "total_precipitation", metres per hour, de-accumulated in the
  # ARCO time series) and the 10 m wind ("u10" / "v10", or their long
  # names, m/s towards the east and the north). Times are UTC. The
  # precipitation stamped hh:00 fell during the hour before it, so
  # midnight's goes to the previous day.
  #
  # The wind is kept hour by hour, with that hour's temperature, for the
  # wind roses (ObservedClimate::Wind): a zip holds one CSV per variable,
  # so an hour's u, v and temperature only meet once every file is read.
  # Three arrays of ~263,000 floats, a few megabytes.
  class HourlySeries
    TIME_COLUMNS = %w[valid_time time date].freeze
    TEMPERATURE_COLUMNS = %w[t2m 2m_temperature].freeze
    PRECIPITATION_COLUMNS = %w[tp total_precipitation].freeze
    WIND_U_COLUMNS = %w[u10 10m_u_component_of_wind].freeze
    WIND_V_COLUMNS = %w[v10 10m_v_component_of_wind].freeze
    KELVIN_ABOVE = 150.0
    ZIP_MAGIC = "PK\x03\x04".b.freeze

    Day = Data.define(:date, :tmin, :tmax, :tmean, :precip_mm)
    # One hour of wind: the month (1-12), the speed (m/s), the direction it
    # blows FROM (degrees from north, clockwise) and the temperature (°C,
    # nil when missing).
    WindHour = Data.define(:month, :speed, :from_deg, :temp_c)

    def initialize(first_year:, last_year:)
      @range = Date.new(first_year, 1, 1)..Date.new(last_year, 12, 31)
      @hours = @range.count * 24
      @days = {}
      @temperature = Array.new(@hours)
      @wind_u = nil
      @wind_v = nil
    end

    # Reads a result file from disk (CSV or zip); returns self.
    def read_file(path)
      if File.binread(path, 4) == ZIP_MAGIC
        Zip::File.open(path) do |zip|
          zip.each do |entry|
            next unless entry.file? && entry.name.downcase.end_with?(".csv")
            entry.get_input_stream { |io| read_csv(io) }
          end
        end
      else
        File.open(path, "r") { |io| read_csv(io) }
      end
      self
    end

    def read_csv(io)
      columns = nil
      CSV.new(io, headers: true).each do |row|
        columns ||= columns_of(row.headers)
        add_row(row, columns)
      end
      self
    end

    # The days with a temperature, in order.
    def days
      @days.sort.filter_map do |date, day|
        next if day[:count].zero?
        Day.new(date:, tmin: day[:min], tmax: day[:max], tmean: day[:sum] / day[:count], precip_mm: day[:precip])
      end
    end

    # Whether the file carried the 10 m wind.
    def wind? = !@wind_u.nil? && !@wind_v.nil?

    # Every hour with both wind components, in order.
    def each_wind_hour
      return enum_for(:each_wind_hour) unless block_given?
      return unless wind?

      first = @range.first
      @hours.times do |index|
        u = @wind_u[index]
        v = @wind_v[index]
        next if u.nil? || v.nil?

        speed = Math.sqrt(u * u + v * v)
        # The wind blows towards (u, v); it comes from the opposite way.
        from = (Math.atan2(-u, -v) * 180 / Math::PI) % 360
        yield WindHour.new(month: (first + index / 24).month, speed:, from_deg: from, temp_c: @temperature[index])
      end
    end

    private
      def columns_of(headers)
        names = headers.map { _1.to_s.strip.downcase }
        find = ->(candidates) { names.index { candidates.include?(_1) } }
        time = find.(TIME_COLUMNS) or raise Providers::Era5Land::Error, "no time column in #{names.inspect}"
        { time:, temperature: find.(TEMPERATURE_COLUMNS), precipitation: find.(PRECIPITATION_COLUMNS),
          wind_u: find.(WIND_U_COLUMNS), wind_v: find.(WIND_V_COLUMNS) }
      end

      def add_row(row, columns)
        stamp = row[columns[:time]].to_s
        date = Date.iso8601(stamp[0, 10])
        hour = stamp[11, 2].to_i

        if columns[:temperature] && (value = number(row[columns[:temperature]]))
          add_temperature(date, hour, value > KELVIN_ABOVE ? value - 273.15 : value)
        end
        add_wind(:@wind_u, date, hour, number(row[columns[:wind_u]])) if columns[:wind_u]
        add_wind(:@wind_v, date, hour, number(row[columns[:wind_v]])) if columns[:wind_v]
        if columns[:precipitation] && (value = number(row[columns[:precipitation]]))
          add_precipitation(hour.zero? ? date - 1 : date, [ value, 0.0 ].max * 1000.0)
        end
      rescue Date::Error
        nil
      end

      def hour_index(date, hour) = (date - @range.first).to_i * 24 + hour

      def add_temperature(date, hour, celsius)
        return unless @range.cover?(date)
        @temperature[hour_index(date, hour)] = celsius
        day = day(date)
        day[:min] = celsius if day[:min].nil? || celsius < day[:min]
        day[:max] = celsius if day[:max].nil? || celsius > day[:max]
        day[:sum] += celsius
        day[:count] += 1
      end

      def add_wind(array, date, hour, value)
        return unless @range.cover?(date)
        values = instance_variable_get(array) || instance_variable_set(array, Array.new(@hours))
        values[hour_index(date, hour)] = value
      end

      def add_precipitation(date, mm)
        day(date)[:precip] += mm if @range.cover?(date)
      end

      def day(date) = @days[date] ||= { min: nil, max: nil, sum: 0.0, count: 0, precip: 0.0 }

      def number(value)
        return nil if value.nil?
        number = Float(value.to_s.strip, exception: false)
        number&.finite? ? number : nil
      end
  end
end

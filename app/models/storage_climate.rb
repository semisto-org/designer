# What a fruit store's readings mean for keeping apples and pears through
# the winter. Usual keeping ranges (to refine per variety): apples 2 to 6 °C
# (a traditional cellar at 6–8 °C still does), pears 0 to 4 °C, both at 85
# to 95 % humidity, dark, airy and frost-free. Fruit ripens several times
# faster at 18–20 °C than at 3–5 °C; below 85 % it shrivels and loses weight.
#
# Each reading gets a status for temperature and for humidity — good, fair
# or bad, plus frost (the min-max thermometer went to 0 °C or below) — and
# the store gets the verdict of its latest reading and a word on winter:
# keeping is decided from November to March.
module StorageClimate
  TEMPERATURE = { good: 0.5..6.0, fair: 6.0..10.0 }.freeze
  HUMIDITY = { good: 85..95, fair: 75..85 }.freeze
  FROST_C = 0.0
  # Keeping months: readings then say whether the store can keep fruit.
  WINTER_MONTHS = [ 11, 12, 1, 2, 3 ].freeze
  STATUS_RANK = %w[good fair bad frost].freeze

  module_function

  # The ranges, for the charts and the AI.
  def ranges
    {
      temperatureC: { good: [ TEMPERATURE[:good].begin, TEMPERATURE[:good].end ], fair: [ TEMPERATURE[:fair].begin, TEMPERATURE[:fair].end ], frost: FROST_C },
      humidityPct: { good: [ HUMIDITY[:good].begin, HUMIDITY[:good].end ], fair: [ HUMIDITY[:fair].begin, HUMIDITY[:fair].end ] }
    }
  end

  # { temperature:, humidity:, overall: } for one reading; each is good,
  # fair, bad, frost (temperature) or nil (not measured), and temperature
  # and humidity also say which way: warm / cold, dry / wet.
  def verdict(reading)
    temperature = temperature_status(reading)
    humidity = humidity_status(reading.humidity_pct)
    statuses = [ temperature&.dig(:status), humidity&.dig(:status) ].compact
    { temperature:, humidity:, overall: statuses.max_by { STATUS_RANK.index(_1) } }
  end

  def temperature_status(reading)
    lows = [ reading.temperature_min_c, reading.temperature_c ].compact.map(&:to_f)
    return { status: "frost", side: "cold" } if lows.any? && lows.min <= FROST_C
    value = reading.temperature_c&.to_f || reading.temperature_max_c&.to_f
    return nil unless value
    if TEMPERATURE[:good].cover?(value) then { status: "good", side: nil }
    elsif TEMPERATURE[:fair].cover?(value) then { status: "fair", side: "warm" }
    else { status: "bad", side: "warm" }
    end
  end

  def humidity_status(value)
    return nil unless value
    if HUMIDITY[:good].cover?(value) then { status: "good", side: nil }
    elsif value > HUMIDITY[:good].end then { status: "fair", side: "wet" }
    elsif HUMIDITY[:fair].cover?(value) then { status: "fair", side: "dry" }
    else { status: "bad", side: "dry" }
    end
  end

  # A store's readings, oldest first, with what they say.
  def summary(readings)
    readings = readings.sort_by { [ _1.measured_on, _1.id ] }
    latest = readings.last
    winter = readings.select { WINTER_MONTHS.include?(_1.measured_on.month) }
    {
      readings: readings.size,
      latest: latest && { measuredOn: latest.measured_on.iso8601, verdict: verdict(latest) },
      winterReadings: winter.size,
      # Min and max seen over the winter (Nov–Mar), to say whether it froze or stayed warm.
      winterLowC: winter.flat_map { [ _1.temperature_min_c, _1.temperature_c ] }.compact.min&.to_f,
      winterHighC: winter.flat_map { [ _1.temperature_max_c, _1.temperature_c ] }.compact.max&.to_f
    }
  end
end

module Infiltration
  # How fast the soil drinks, from a field test: water poured into a hole (or
  # a ring pushed into the ground) after the soil around it was soaked, and
  # the height of water read at intervals.
  #
  # - Ring: the water goes down through the bottom only, so the rate is the
  #   drop in height over the time, in mm/h.
  # - Hole: the water also leaves through the walls. The Porchet method
  #   (« méthode à niveau variable », the one used for septic fields in
  #   France and Belgium) turns the drop into a conductivity that does not
  #   depend on the hole's size: K = r/2 × ln((h1 + r/2) / (h2 + r/2)) / Δt.
  #
  # Each reading is { "t_s" => seconds since the start, "depth_cm" => height
  # of water }. A height that goes up means the hole was filled again: the
  # interval across it is not a measurement. The rate is the mean of the
  # last three intervals once they agree within 25 % (the soil is saturated
  # and the rate stable), else the last interval's, marked as not stable.
  class Measurement
    METHODS = %w[hole ring].freeze
    MAX_READINGS = 60
    MAX_DEPTH_CM = 200
    MAX_SECONDS = 3 * 24 * 3600
    STABLE_SPREAD = 0.25
    # Upper bounds (mm/h) of the classes, slowest first.
    CLASSES = { "very_slow" => 5, "slow" => 15, "moderate" => 50, "rapid" => 150, "very_rapid" => Float::INFINITY }.freeze

    Interval = Data.define(:from_s, :to_s, :rate_mm_h)
    Result = Data.define(:intervals, :rate_mm_h, :stable) do
      def rate_class = Measurement.class_of(rate_mm_h)
    end

    def self.class_of(rate)
      return nil if rate.nil?

      CLASSES.find { |_, max| rate < max }&.first
    end

    # Readings as stored, or nil when they are not a list of well-formed
    # readings in time order.
    def self.clean_readings(raw)
      return [] if raw.nil?
      return nil unless raw.is_a?(Array) && raw.size <= MAX_READINGS

      readings = raw.map do |reading|
        return nil unless reading.is_a?(Hash)

        t = Float(reading["t_s"], exception: false)
        depth = Float(reading["depth_cm"], exception: false)
        return nil unless t && depth && t.between?(0, MAX_SECONDS) && depth.between?(0, MAX_DEPTH_CM)

        { "t_s" => t.round, "depth_cm" => depth.round(1) }
      end
      readings.each_cons(2).all? { |a, b| b["t_s"] > a["t_s"] } ? readings : nil
    end

    def initialize(method:, diameter_cm:, readings:)
      @method = METHODS.include?(method) ? method : "hole"
      @radius_mm = diameter_cm.to_f.positive? ? diameter_cm.to_f * 5 : 150.0
      @readings = readings || []
    end

    def call
      intervals = @readings.each_cons(2).filter_map do |a, b|
        h1 = a["depth_cm"].to_f * 10
        h2 = b["depth_cm"].to_f * 10
        next if h2 > h1 # filled again

        hours = (b["t_s"] - a["t_s"]) / 3600.0
        next unless hours.positive?

        Interval.new(from_s: a["t_s"], to_s: b["t_s"], rate_mm_h: rate(h1, h2, hours))
      end
      return Result.new(intervals:, rate_mm_h: nil, stable: false) if intervals.size < 2

      last = intervals.last(3).map(&:rate_mm_h)
      mean = last.sum / last.size
      stable = last.size == 3 && (mean.zero? || (last.max - last.min) / mean <= STABLE_SPREAD)
      Result.new(intervals:, rate_mm_h: (stable ? mean : last.last).round(1), stable:)
    end

    private
      def rate(h1, h2, hours)
        return (h1 - h2) / hours if @method == "ring"

        half = @radius_mm / 2
        half * Math.log((h1 + half) / (h2 + half)) / hours
      end
  end
end

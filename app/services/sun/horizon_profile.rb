module Sun
  # A horizon profile: heights (degrees) at compass azimuths, read in
  # between by linear interpolation, all the way round (359° sits next to 0°).
  class HorizonProfile
    attr_reader :points

    # points: [[azimuth, height], ...] in any order.
    def initialize(points)
      @points = points.map { |azimuth, height| [ azimuth.to_f % 360, height.to_f ] }.uniq(&:first).sort_by(&:first)
      raise ArgumentError, "empty horizon profile" if @points.empty?
    end

    def height_at(azimuth)
      azimuth = azimuth.to_f % 360
      after_index = @points.index { |a, _| a >= azimuth }
      before = after_index ? @points[after_index - 1] : @points.last
      after = after_index ? @points[after_index] : @points.first
      return after[1] if after[0] == azimuth

      span = (after[0] - before[0]) % 360
      return before[1] if span.zero?

      fraction = ((azimuth - before[0]) % 360) / span
      before[1] + (after[1] - before[1]) * fraction
    end

    def to_proc = method(:height_at).to_proc
  end
end

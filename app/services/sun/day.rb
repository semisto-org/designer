module Sun
  # One day of sun at a place: the sun's path across the sky, and how long
  # it shines over a flat open horizon versus over the real horizon of the
  # terrain (hills and valley sides hide it for part of the day).
  #
  #   day = Sun::Day.new(lat: 50.32, lng: 4.88, date: Date.new(2026, 12, 21), horizon: ->(azimuth) { 7.3 })
  #   day.open_minutes     # the sun above a flat horizon
  #   day.terrain_minutes  # the sun above the terrain's horizon (nil without one)
  #   day.path             # [{ minutes:, azimuth:, elevation: }] every PATH_STEP minutes
  #
  # The horizon is a callable azimuth (compass degrees) -> height (degrees).
  # Times are local solar time, in minutes after midnight.
  class Day
    STEP = 2 # minutes, for the counts
    PATH_STEP = 10 # minutes, for the drawn path
    # Path points slightly below the horizon are kept so a drawing can start
    # the path at the horizon line.
    PATH_FLOOR = -6

    attr_reader :date

    def initialize(lat:, lng:, date:, horizon: nil)
      @lat = lat
      @lng = lng
      @date = date
      @horizon = horizon
    end

    def open_minutes = counts[:open]
    def terrain_minutes = @horizon && counts[:terrain]

    # First and last minutes of direct sun over the terrain's horizon.
    def first_sun = @horizon && counts[:first]
    def last_sun = @horizon && counts[:last]

    def noon_elevation = position(12.0).elevation

    def path
      @path ||= (0..(24 * 60)).step(PATH_STEP).filter_map do |minutes|
        sun = position(minutes / 60.0)
        { minutes:, azimuth: sun.azimuth, elevation: sun.elevation } if sun.elevation > PATH_FLOOR
      end
    end

    private
      def position(hours) = SolarPosition.at(lat: @lat, lng: @lng, date: @date, solar_hours: hours)

      # Samples taken at the middle of each STEP-minute slice of the day.
      def counts
        @counts ||= begin
          open = terrain = 0
          first = last = nil
          (0...(24 * 60)).step(STEP) do |start|
            sun = position((start + STEP / 2.0) / 60.0)
            next unless sun.elevation.positive?

            open += STEP
            next unless @horizon && sun.elevation > @horizon.call(sun.azimuth)

            terrain += STEP
            first ||= start
            last = start + STEP
          end
          { open:, terrain:, first:, last: }
        end
      end
  end
end

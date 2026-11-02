module Maps
  # The first reading of a map's place (« Voici ton lieu », `get_map`):
  # how much and which way the land slopes, where rain water runs to, its
  # size. The same numbers as a tried place (Trials::Reading), kept in the
  # cache for the outline they were read on, so the editor and the AI ask
  # the region's relief once.
  class PlaceReading
    TTL = 30.days
    # A reading without relief (service down) is asked again sooner.
    RETRY = 1.hour

    def initialize(map, **options)
      @map = map
      @options = options
    end

    # Hash with string keys (see Trials::Reading#call); {} without an outline.
    def call
      return {} unless @map.boundary
      cached = Rails.cache.read(key)
      return cached if cached

      reading = Trials::Reading.new(@map, **@options).call
      Rails.cache.write(key, reading, expires_in: reading.key?("slope_pct") ? TTL : RETRY)
      reading
    end

    private
      def key
        [ "maps/place_reading/v1", @map.id, Digest::SHA1.hexdigest(@map.boundary.as_text) ]
      end
  end
end

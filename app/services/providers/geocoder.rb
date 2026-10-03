# Address search, behind a small stable interface:
#
#   geocoder = Providers::Geocoder.build
#   geocoder.available?                       # false when GEOCODER_PROVIDER=none
#   geocoder.search("Rue du Bois 3, Yvoir", region:)  # => [Result, ...]
#
# Configured by ENV:
# - GEOCODER_PROVIDER: nominatim (default) | photon | none
# - GEOCODER_URL: base URL (defaults to the public instance of the provider)
# - GEOCODER_USER_AGENT_EMAIL: contact sent to Nominatim (usage policy)
#
# The public Nominatim allows low volume only (1 request/s, no
# search-as-you-type): the UI searches on Enter, results are cached a day
# and calls are throttled to one per second for the whole app.
module Providers
  class Geocoder
    class Unavailable < StandardError; end

    Result = Data.define(:label, :detail, :lng, :lat, :bbox, :zoom) do
      def as_json(*) = { label:, detail:, lng:, lat:, bbox:, zoom: }
    end

    DEFAULT_URLS = {
      "nominatim" => "https://nominatim.openstreetmap.org",
      "photon" => "https://photon.komoot.io"
    }.freeze
    MIN_LENGTH = 3
    MAX_LENGTH = 200
    LIMIT = 6
    CACHE_TTL = 1.day

    def self.build(env = ENV)
      name = env.fetch("GEOCODER_PROVIDER", "nominatim").to_s.strip.downcase
      adapter = case name
      when "nominatim" then Nominatim
      when "photon" then Photon
      end
      return new(nil) unless adapter
      new(adapter.new(url: env["GEOCODER_URL"].presence || DEFAULT_URLS[name], contact: env["GEOCODER_USER_AGENT_EMAIL"].presence))
    end

    def initialize(adapter)
      @adapter = adapter
    end

    def available? = !@adapter.nil?

    def search(query, region: nil)
      raise Unavailable, "not configured" unless available?
      query = query.to_s.squish.first(MAX_LENGTH)
      return [] if query.length < MIN_LENGTH

      key = [ "map_data/geocode", @adapter.class.name.demodulize, region&.id, Digest::SHA1.hexdigest(query.downcase) ].join("/")
      rows = Rails.cache.fetch(key, expires_in: CACHE_TTL) do
        @adapter.search(query, region:).first(LIMIT).map(&:to_h)
      end
      rows.map { |row| Result.new(**row.symbolize_keys) }
    rescue GeoHttp::Unavailable => error
      raise Unavailable, error.message
    end

    # Zoom that frames a result: a house close up, a village wider.
    def self.zoom_for(bbox)
      return 18 unless bbox
      span = [ (bbox[2] - bbox[0]).abs, (bbox[3] - bbox[1]).abs * 1.5 ].max
      return 18 if span <= 0
      Math.log2(562.5 / span).floor.clamp(12, 18)
    end

    def self.region_bbox(region)
      region&.as_inertia&.dig(:bounds)
    end
  end
end

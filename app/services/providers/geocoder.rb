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
# - GEOCODER_FALLBACK: photon (default with nominatim) | none — asked when
#   the main provider finds nothing or is down. Nominatim matches words
#   exactly ("Fonds d'Ahinvaux" misses the road OSM calls "Fond
#   d'Ahinvaux"); Photon tolerates typos and plurals.
# - GEOCODER_FALLBACK_URL: base URL of the fallback
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
      contact = env["GEOCODER_USER_AGENT_EMAIL"].presence
      main = adapter.new(url: env["GEOCODER_URL"].presence || DEFAULT_URLS[name], contact:)
      fallback_name = env.fetch("GEOCODER_FALLBACK", name == "nominatim" ? "photon" : "none").to_s.strip.downcase
      fallback = if fallback_name == "photon" && name != "photon"
        Photon.new(url: env["GEOCODER_FALLBACK_URL"].presence || DEFAULT_URLS["photon"], contact:)
      end
      new(main, fallback:)
    end

    def initialize(adapter, fallback: nil)
      @adapter = adapter
      @fallback = fallback
    end

    def available? = !@adapter.nil?

    def search(query, region: nil)
      raise Unavailable, "not configured" unless available?
      query = query.to_s.squish.first(MAX_LENGTH)
      return [] if query.length < MIN_LENGTH

      adapters = [ @adapter, @fallback ].compact
      key = [ "map_data/geocode", adapters.map { |a| a.class.name.demodulize }.join("+"), region&.id, Digest::SHA1.hexdigest(query.downcase) ].join("/")
      rows = Rails.cache.fetch(key, expires_in: CACHE_TTL) do
        first_found(adapters, query, region).first(LIMIT).map(&:to_h)
      end
      rows.map { |row| Result.new(**row.symbolize_keys) }
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

    # The country results are restricted to (none for the "europe" base).
    def self.region_country(region)
      region&.country_code.presence unless region.nil? || region.europe?
    end

    private
      # The first adapter with results wins. Unavailable only when no
      # adapter answered at all: "nothing found" is a normal answer.
      def first_found(adapters, query, region)
        error = nil
        answered = false
        adapters.each do |adapter|
          results = adapter.search(query, region:)
          return results if results.any?
          answered = true
        rescue GeoHttp::Unavailable => e
          error = e
        end
        raise Unavailable, error.message if error && !answered
        []
      end
  end
end

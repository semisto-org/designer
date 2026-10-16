# Checks a latin name against the GBIF Backbone Taxonomy (CC0), before a
# person adds a species the catalogue lacks: it catches typos (« Salvia
# nemorossa »), outdated names (« Stipa tenuissima » is now « Nassella
# tenuissima ») and names that are not a species at all (« Rosa », « Choux
# bizarre »), so the catalogue does not fill up with duplicates.
#
#   gbif = Providers::Gbif.build
#   gbif.available?                   # false when GBIF_PROVIDER=none
#   gbif.match("Stipa tenuissima")    # => Match (status "synonym", accepted_name "Nassella tenuissima")
#
# Match#status:
# - "accepted": the name is the accepted name of a species (or below);
# - "synonym":  GBIF knows it, under another accepted name (`accepted_name`);
# - "fuzzy":    GBIF read it as another spelling (`name`);
# - "unknown":  no species matches (a genus, a cultivar name, a typo too far).
#
# Raises Providers::Gbif::Unavailable (timeout, error) rather than answering
# « unknown », so the interface says it could not check instead of « no ».
#
# Configured by ENV:
# - GBIF_PROVIDER: gbif (default) | none
module Providers
  class Gbif
    class Unavailable < StandardError; end

    Match = Data.define(:status, :name, :accepted_name, :family, :key, :rank) do
      # The name to keep in the catalogue: the accepted one when GBIF knows it.
      def suggested_name = accepted_name || name

      def as_json(*)
        { status:, name:, acceptedName: accepted_name, suggestedName: suggested_name, family:, key:, rank:,
          url: key && "https://www.gbif.org/species/#{key}" }
      end
    end

    MATCH_URL = "https://api.gbif.org/v1/species/match".freeze
    SPECIES_RANKS = %w[SPECIES SUBSPECIES VARIETY FORM].freeze
    OPEN_TIMEOUT = 3
    TIMEOUT = 8
    USER_AGENT = "SemistoTerranova/1.0 (+https://terranova.semisto.org; hello@semisto.org)".freeze

    def self.build(env = ENV)
      new(available: env.fetch("GBIF_PROVIDER", "gbif").to_s.strip.downcase == "gbif")
    end

    def initialize(available: true, connection: nil)
      @available = available
      @connection = connection
    end

    def available? = @available

    def match(latin_name)
      raise Unavailable, "not configured" unless available?

      query = latin_name.to_s.squish
      return Match.new(status: "unknown", name: nil, accepted_name: nil, family: nil, key: nil, rank: nil) if query.length < 3

      Rails.cache.fetch([ "gbif-match", query.downcase ], expires_in: 30.days) { lookup(query) }
    end

    # The name as a gardener writes it: GBIF's canonical name drops the hybrid
    # sign, which its scientific name keeps (« Hamamelis × intermedia Rehder »).
    def self.display_name(canonical, scientific)
      return canonical if canonical.blank? || scientific.to_s.exclude?("×")
      genus, *rest = canonical.split(" ")
      scientific.start_with?("× ") ? "× #{canonical}" : [ genus, "×", *rest ].join(" ")
    end

    private
      def lookup(query)
        data = get_json(MATCH_URL, name: query, kingdom: "Plantae", verbose: false)
        rank = data["rank"].to_s
        if %w[NONE HIGHERRANK].include?(data["matchType"]) || !SPECIES_RANKS.include?(rank)
          return Match.new(status: "unknown", name: nil, accepted_name: nil, family: nil, key: nil, rank: rank.presence)
        end

        name = self.class.display_name(data["canonicalName"], data["scientificName"])
        synonym = data["status"] == "SYNONYM" && data["species"].present? && data["species"] != data["canonicalName"]
        status = if synonym then "synonym"
        elsif data["matchType"] == "FUZZY" then "fuzzy"
        else "accepted"
        end
        accepted = synonym ? data["species"] : nil
        Match.new(status:, name:, accepted_name: accepted, family: data["family"].presence,
                  key: synonym ? data["acceptedUsageKey"] || data["speciesKey"] : data["usageKey"], rank:)
      end

      def get_json(url, params)
        response = connection.get(url, params)
        raise Unavailable, "HTTP #{response.status}" unless response.success?

        JSON.parse(response.body)
      rescue JSON::ParserError
        raise Unavailable, "garbled answer"
      rescue Faraday::Error => error
        raise Unavailable, error.class.name
      end

      def connection
        @connection ||= Faraday.new(request: { open_timeout: OPEN_TIMEOUT, timeout: TIMEOUT }) do |f|
          f.headers["User-Agent"] = USER_AGENT
        end
      end
  end
end

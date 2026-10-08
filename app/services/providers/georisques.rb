# Natural and technological risks at a point in France, from Géorisques
# (Ministère de la Transition écologique, BRGM), behind a small stable
# interface:
#
#   risks = Providers::Georisques.for(region)   # nil when the region has none
#   risks.available?                            # false when GEORISQUES_URL=none
#   risks.report_at(point)                      # => Hash (see #parse)
#
# One call: GET <base>/resultats_rapport_risque?latlon=<lng>,<lat>, the
# report Géorisques prints for an address ("Mes risques"): 12 natural risks
# (flood, groundwater flooding, coastal, earthquake, ground movement,
# coastline retreat, clay shrink-swell, avalanche, wildfire, volcano,
# cyclone, radon) and 6 technological ones (classified installations,
# nuclear, hazardous pipelines, soil pollution, dam failure, mining), each
# with a status for the commune and, when the point resolves, for the
# address. API v1, no key. Data under Licence Ouverte 2.0 (Etalab).
#
# Picked per region in settings: `site_rules.risks = "georisques"`.
#
# Configured by ENV:
# - GEORISQUES_URL: the API v1 base (default: the www host; the bare apex
#   host has been seen refusing connections), "none" to switch it off.
#
# Answers are cached a week per point (~10 m).
module Providers
  class Georisques
    class Unavailable < StandardError; end

    DEFAULT_URL = "https://www.georisques.gouv.fr/api/v1".freeze
    SITE_URL = "https://www.georisques.gouv.fr".freeze
    # The address search of "Mes risques", when the answer has no report link.
    REPORT_PAGE = "#{SITE_URL}/mes-risques/connaitre-les-risques-pres-de-chez-moi".freeze
    CACHE_TTL = 1.week
    TIMEOUT = 10

    NATURAL = %w[
      inondation remonteeNappe risqueCotier seisme mouvementTerrain reculTraitCote
      retraitGonflementArgile avalanche feuForet eruptionVolcanique cyclone radon
    ].freeze
    TECHNOLOGICAL = %w[icpe nucleaire canalisationsMatieresDangereuses pollutionSols ruptureBarrage risqueMinier].freeze

    def self.for(region, env = ENV)
      return nil unless region&.setting(:site_rules, :risks) == "georisques"

      build(env)
    end

    def self.build(env = ENV)
      url = env["GEORISQUES_URL"].to_s.strip
      return new(nil) if url.casecmp?("none")

      new(url.presence || DEFAULT_URL)
    end

    def initialize(url)
      @url = url&.chomp("/")
    end

    def available? = !@url.nil?

    # Raises Unavailable when the upstream cannot answer.
    def report_at(point)
      raise Unavailable, "not configured" unless available?

      key = [ "site_rules/georisques/v1", Digest::SHA1.hexdigest(@url)[0, 8], point.cache_key(4) ].join("/")
      Rails.cache.fetch(key, expires_in: CACHE_TTL) { fetch(point) }
    end

    private
      def fetch(point)
        latlon = "#{point.lng.round(5)},#{point.lat.round(5)}"
        json = GeoHttp.get_json("#{@url}/resultats_rapport_risque", params: { latlon: }, headers: { "Accept" => "application/json" }, timeout: TIMEOUT)
        raise Unavailable, "unexpected answer" unless json.is_a?(Hash) && (json["risquesNaturels"].is_a?(Hash) || json["risquesTechnologiques"].is_a?(Hash))

        parse(json)
      rescue GeoHttp::Unavailable => e
        raise Unavailable, e.message
      end

      # {
      #   address: "12 rue …" | nil, commune: { name:, insee:, postcode: },
      #   scope: "address" | "commune", url: "https://…" | nil,
      #   risks: [ { key:, group: "natural" | "technological", present:,
      #              upstream_label:, commune_status:, address_status: } ]
      # }
      def parse(json)
        address = json["adresse"].is_a?(Hash) ? json["adresse"]["libelle"].presence : nil
        commune = json["commune"].is_a?(Hash) ? json["commune"] : {}
        {
          address:,
          commune: { name: commune["libelle"].presence, insee: commune["codeInsee"].presence, postcode: commune["codePostal"].presence },
          scope: address ? "address" : "commune",
          url: report_url(json["url"]),
          risks: risks(json["risquesNaturels"], NATURAL, "natural") + risks(json["risquesTechnologiques"], TECHNOLOGICAL, "technological")
        }
      end

      def risks(block, keys, group)
        return [] unless block.is_a?(Hash)

        # Known keys first, in a stable order, then any key Géorisques adds.
        (keys + (block.keys - keys)).filter_map do |key|
          risk = block[key]
          next unless risk.is_a?(Hash)

          commune_status = risk["libelleStatutCommune"].to_s.strip.presence
          address_status = risk["libelleStatutAdresse"].to_s.strip.presence
          {
            key:, group:,
            present: present?(risk["present"], address_status || commune_status),
            upstream_label: risk["libelle"].to_s.strip.presence,
            commune_status:, address_status:
          }
        end
      end

      # The boolean when Géorisques gives one, else read from the status:
      # "Risque existant", "Exposition moyenne", "Zone 3"… mean concerned;
      # "Risque inexistant", "Risque non …", "Non concerné", "Exposition
      # nulle" do not.
      def present?(flag, status)
        return flag if flag == true || flag == false
        return false if status.blank?

        text = I18n.transliterate(status).downcase
        return false if text.start_with?("risque non", "non ", "aucun") || %w[non\ concern inexistant nulle].any? { text.include?(_1) }

        true
      end

      def report_url(value)
        url = value.to_s.strip
        return nil if url.blank?
        return url if url.start_with?("https://")

        url.start_with?("/") ? "#{SITE_URL}#{url}" : nil
      end
  end
end

# The Géoportail de l'urbanisme (GPU) through the IGN API Carto, module
# "urbanisme": every endpoint takes a GeoJSON geometry (WGS84, point or
# polygon) and answers the objects that intersect it, as a FeatureCollection.
#
#   municipality       the commune(s), and whether they fall under the RNU
#                      (no local plan: the national rules apply)
#   document           the local plan in force (PLU, PLUi, POS, carte
#                      communale, PSMV) and its GPU id
#   zone-urba          the PLU zones (libelle, typezone U/AUc/AUs/A/N, the
#                      regulation file)
#   secteur-cc         the sectors of a carte communale (typesect 01
#                      constructible, 02 reserved for activities, 03 not
#                      constructible)
#   prescription-*     prescriptions drawn on the plan (classified woodland,
#                      landscape features to protect, reserved sites…)
#   assiette-sup-*     public utility easements (historic monument
#                      surroundings, water catchment protection, power
#                      lines, gas pipelines, flood risk plans…)
#
# The geometries are dropped: the report says what applies, the map layers
# show where. Data: Géoportail de l'urbanisme, Licence Ouverte 2.0.
#
# Configured by ENV:
# - GPU_URL: the module base (default https://apicarto.ign.fr/api/gpu),
#   "none" to switch it off.
#
# Answers are cached a week per geometry.
module Providers
  module Urbanism
    class Gpu
      DEFAULT_URL = "https://apicarto.ign.fr/api/gpu".freeze
      PORTAL_URL = "https://www.geoportail-urbanisme.gouv.fr".freeze
      FILES_URL = "https://data.geopf.fr/annexes/gpu/documents".freeze
      CACHE_TTL = 1.week
      TIMEOUT = 15

      # Without these three the report would say nothing true; the others
      # only add detail (the report is then marked partial).
      ESSENTIAL = %w[municipality document zone-urba].freeze
      OPTIONAL = %w[secteur-cc prescription-surf prescription-lin prescription-pct assiette-sup-s assiette-sup-l assiette-sup-p].freeze
      KINDS = { "surf" => "surface", "lin" => "line", "pct" => "point", "s" => "surface", "l" => "line", "p" => "point" }.freeze

      # Easement categories that describe networks (electricity, gas,
      # hydrocarbons, water and sewage pipes, telecoms): sensitive, hidden
      # by default in public views, exports and the MCP.
      NETWORK_EASEMENTS = %w[a5 i1 i3 i4 i5 i6 pt1 pt2 pt3].freeze

      def self.build(env = ENV)
        url = env["GPU_URL"].to_s.strip
        return new(nil) if url.casecmp?("none")

        new(url.presence || DEFAULT_URL)
      end

      def initialize(url)
        @url = url&.chomp("/")
      end

      def available? = !@url.nil?

      # `geometry`: a GeoJSON geometry Hash (Point, Polygon or MultiPolygon).
      # Raises Urbanism::Unavailable when the upstream cannot answer.
      def rules_for(geometry)
        raise Unavailable, "not configured" unless available?

        body = { geom: geometry }.to_json
        key = [ "site_rules/gpu/v1", Digest::SHA1.hexdigest("#{@url}|#{body}")[0, 16] ].join("/")
        Rails.cache.fetch(key, expires_in: CACHE_TTL) { fetch(body) }
      end

      private
        def fetch(body)
          answers = (ESSENTIAL + OPTIONAL).index_with { |endpoint| Thread.new { request(endpoint, body) } }.transform_values(&:value)
          failed = answers.select { |_, value| value.is_a?(StandardError) }
          raise Unavailable, failed.values.first.message if (failed.keys & ESSENTIAL).any?

          features = answers.transform_values { |value| value.is_a?(StandardError) ? [] : value }
          parse(features).merge(partial: failed.any?)
        end

        # The features' properties, or the error (raised in the caller's thread).
        def request(endpoint, body)
          response = GeoHttp.connection(timeout: TIMEOUT).post("#{@url}/#{endpoint}", body, {
            "Content-Type" => "application/json", "Accept" => "application/json", "User-Agent" => GeoHttp::USER_AGENT
          })
          raise Unavailable, "#{endpoint}: HTTP #{response.status}" unless response.success?

          json = JSON.parse(response.body)
          Array(json.is_a?(Hash) ? json["features"] : nil).filter_map { |f| f["properties"] if f.is_a?(Hash) && f["properties"].is_a?(Hash) }
        rescue Faraday::Error, JSON::ParserError, Unavailable => e
          e.is_a?(Unavailable) ? e : Unavailable.new("#{endpoint}: #{e.message}")
        end

        def parse(features)
          communes = features["municipality"].reject { _1["is_deleted"] }.map { |p| { name: titleize(p["name"]), insee: p["insee"].to_s, rnu: p["is_rnu"] == true } }
          documents = features["document"].map { document(_1) }.uniq { _1[:id] }
          {
            communes:,
            rnu: documents.empty? && communes.any? && communes.all? { _1[:rnu] },
            documents:,
            zones: features["zone-urba"].map { zone(_1) }.uniq { _1.values_at(:label, :type, :url) },
            sectors: features["secteur-cc"].map { sector(_1) }.uniq { _1.values_at(:label, :type) },
            prescriptions: prescriptions(features),
            easements: easements(features)
          }
        end

        def document(props)
          id = (props["gpu_doc_id"] || props["id"]).to_s
          {
            id:,
            type: props["du_type"].to_s.presence,
            title: props["grid_title"].to_s.strip.presence,
            date: date(props["name"].to_s[/_(\d{8})\z/, 1]),
            url: id.present? ? "#{PORTAL_URL}/document/by-id/#{id}" : nil
          }
        end

        def zone(props)
          type = props["typezone"].to_s.strip
          {
            label: props["libelle"].to_s.strip,
            long_label: props["libelong"].to_s.strip.presence,
            type: type.presence,
            family: zone_family(type),
            date: date(props["datappro"]) || date(props["datvalid"]),
            url: props["urlfic"].to_s.start_with?("https://") ? props["urlfic"] : file_url(props, props["nomfic"])
          }
        end

        # CNIG typology: U, AUc / AUs, A, N (sometimes with a suffix).
        def zone_family(type)
          case type.upcase
          when /\AAU/ then "au"
          when /\AU/ then "u"
          when /\AA/ then "a"
          when /\AN/ then "n"
          else "other"
          end
        end

        SECTOR_FAMILIES = { "01" => "constructible", "02" => "activities", "03" => "not_constructible" }.freeze

        def sector(props)
          type = props["typesect"].to_s.strip
          {
            label: props["libelle"].to_s.strip,
            type: type.presence,
            family: SECTOR_FAMILIES.fetch(type, "other"),
            date: date(props["datappro"]) || date(props["datvalid"]),
            url: file_url(props, props["nomfic"])
          }
        end

        # One line per prescription label, counting the objects.
        def prescriptions(features)
          %w[surf lin pct].flat_map { |suffix| features["prescription-#{suffix}"].map { [ _1, KINDS[suffix] ] } }
            .group_by { |props, _| [ props["typepsc"].to_s, props["libelle"].to_s.strip ] }
            .map do |(type, label), rows|
              { type: type.presence, label: label.presence, kinds: rows.map(&:last).uniq, count: rows.size }
            end
        end

        # One line per easement category (57 historic monument surroundings
        # in central Lyon say one thing to a gardener), with the first act.
        def easements(features)
          %w[s l p].flat_map { |suffix| features["assiette-sup-#{suffix}"] }
            .group_by { _1["suptype"].to_s.downcase }
            .map do |category, rows|
              first = rows.first
              {
                category: category.presence,
                kind: first["typeass"].to_s.strip.presence,
                names: rows.filter_map { _1["nomsuplitt"].to_s.strip.presence }.uniq.first(3),
                count: rows.size,
                network: NETWORK_EASEMENTS.include?(category),
                url: file_url(first, first["fichier"])
              }
            end
        end

        def file_url(props, file)
          partition, doc = props["partition"].to_s, props["gpu_doc_id"].to_s
          return nil if file.blank? || partition.blank? || doc.blank?

          "#{FILES_URL}/#{[ partition, doc, file ].map { ERB::Util.url_encode(_1) }.join("/")}"
        end

        def date(value)
          Date.strptime(value.to_s, "%Y%m%d").iso8601
        rescue Date::Error
          nil
        end

        PARTICLES = %w[de du des la le les sur sous en et lès lez aux au d l].freeze

        # "SAINT-LEGER-DE-FOUGERET" → "Saint-Leger-de-Fougeret" (the GPU
        # names are upper case and unaccented).
        def titleize(name)
          name.to_s.downcase.split(/(?<=[\s'-])/).each_with_index.map do |part, index|
            word = part.sub(/[\s'-]\z/, "")
            index.positive? && PARTICLES.include?(word) ? part : part.sub(/\A[[:alpha:]]/, &:upcase)
          end.join
        end
    end
  end
end

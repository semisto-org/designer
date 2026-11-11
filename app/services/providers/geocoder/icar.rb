module Providers
  class Geocoder
    # ICAR, the Walloon register of addresses (SPW), read through its ArcGIS
    # MapServer: every official house number and street of Wallonia, with
    # the street names the communes gave them. OpenStreetMap misses many
    # rural numbers and spells some lanes differently (« Fond » or « Fonds
    # d'Ahinvaux »), so a region whose settings say `geocoder.provider =
    # icar` asks it first, with `geocoder.icar.url` the MapServer.
    #
    # The service has no free-text search: the query is split into a
    # house number, a postcode and words, and each word must appear in the
    # street name (or the commune's). Layer 1 holds the address points,
    # layer 4 the streets.
    class Icar
      ADDRESSES = 1
      STREETS = 4
      # Words that say nothing about which street it is.
      STOP_WORDS = %w[rue route chemin avenue place allee allée impasse sentier clos quai boulevard chaussee chaussée
                      de du des la le les l d au aux et en sur sous a à lieu dit].freeze

      def initialize(url:)
        @url = url.to_s.chomp("/")
      end

      def search(query, region: nil) # rubocop:disable Lint/UnusedMethodArgument
        parsed = self.class.parse(query)
        return [] if parsed[:words].empty?
        rows = parsed[:number] ? addresses(parsed) : []
        rows = streets(parsed) if rows.empty?
        rank(rows, parsed[:tokens])
      end

      # "Rue du Moulin 12, 5530 Yvoir" → { number: "12", postcode: "5530", words: ["MOULIN", "YVOIR"], tokens: [all words] }
      def self.parse(query)
        text = query.to_s.squish
        postcode = text[/\b[1-9]\d{3}\b/]
        text = text.sub(postcode, " ") if postcode
        number = text[/\b\d{1,4}[a-zA-Z]?\b/]
        text = text.sub(number, " ") if number
        tokens = I18n.transliterate(text).upcase.scan(/[A-Z]{2,}/).uniq
        words = tokens.reject { |w| STOP_WORDS.include?(w.downcase) }.first(5)
        { number:, postcode:, words:, tokens: }
      end

      private
        # Most whole words typed first (« Grand-Place » before « Grand-Rue »
        # and « Place des Grands Prés »), then the shorter name.
        def rank(rows, words)
          rows.sort_by.with_index do |row, i|
            tokens = I18n.transliterate(row.label).upcase.scan(/[A-Z]{2,}/)
            [ -(words & tokens).size, row.label.length, i ]
          end
        end

        def addresses(parsed)
          where = [ "ADR_NUMERO = #{quote(parsed[:number])}", "ADR_FIN IS NULL", *place_clauses(parsed) ].join(" AND ")
          features(ADDRESSES, where, "ADR_NUMERO,ADR_BTE,RUE_NM,CODE_POSTAL,COM_NM").filter_map do |feature|
            a = feature["attributes"]
            lng, lat = feature.dig("geometry", "x"), feature.dig("geometry", "y")
            next unless lng && lat
            label = [ [ a["RUE_NM"], a["ADR_NUMERO"] ].compact.join(" "), [ a["CODE_POSTAL"], a["COM_NM"] ].compact.join(" ") ].join(", ")
            Result.new(label:, detail: "ICAR", lng: lng.to_f, lat: lat.to_f, bbox: nil, zoom: 19)
          end.uniq(&:label)
        end

        # A street without its number: the middle of its line.
        def streets(parsed)
          words = parsed[:words]
          where = [ "RUE_FIN IS NULL", *place_clauses(parsed.merge(postcode: nil), words:) ].join(" AND ")
          features(STREETS, where, "RUE_NM,COM_NM").filter_map do |feature|
            a = feature["attributes"]
            points = Array(feature.dig("geometry", "paths")).flatten(1)
            next if points.empty?
            lngs, lats = points.map(&:first), points.map(&:last)
            lng, lat = points[points.size / 2]
            Result.new(label: [ a["RUE_NM"], a["COM_NM"] ].compact.join(", "), detail: "ICAR", lng: lng.to_f, lat: lat.to_f,
                       bbox: [ lngs.min, lats.min, lngs.max, lats.max ], zoom: 17)
          end.uniq(&:label)
        end

        # Each word in the street's name or the commune's; the postcode when given.
        # An E stands for any letter: the register writes « Eglise » in one
        # commune and « Église » in the next, and its SQL has no unaccent.
        def place_clauses(parsed, words: parsed[:words])
          clauses = words.map do |w|
            pattern = quote("%#{w.tr("E", "_")}%")
            "(UPPER(RUE_NM) LIKE #{pattern} OR UPPER(COM_NM) LIKE #{pattern})"
          end
          clauses << "CODE_POSTAL = #{quote(parsed[:postcode])}" if parsed[:postcode]
          clauses
        end

        def features(layer, where, fields)
          data = GeoHttp.get_json("#{@url}/#{layer}/query", params: {
            where:, outFields: fields, returnGeometry: true, outSR: 4326, f: "json", resultRecordCount: LIMIT * 2
          }, timeout: 8)
          raise GeoHttp::Unavailable, data["error"].to_json if data.is_a?(Hash) && data["error"]
          Array(data.is_a?(Hash) ? data["features"] : nil)
        end

        def quote(value) = "'#{value.to_s.gsub("'", "''")}'"
    end
  end
end

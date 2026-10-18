# The open pages Jev reads to check a species' values (Catalog::ValueCheck).
# Jev knows nothing about a plant by itself: it judges a TEXT, so what it can
# confirm is what these pages say.
#
# - PFAF (pfaf.org): one page per latin name, in English, that states habit,
#   height × spread, foliage, fertility, soil, shade, USDA zone and edible
#   parts. Its text is only READ to judge: never stored, never shown
#   (CLAUDE.md, PFAF values may be cited, its texts never copied).
# - Wikipédia, in English and in French: introduction and botanical sections
#   (CC BY-SA 4.0, an excerpt may be shown with its link).
#
#   pages = Providers::PlantPages.build
#   pages.for("Ocimum kilimandscharicum")  # => [Page(key: "pfaf", …), Page(key: "wikipedia_en", …)]
#
# A source that fails never stops the others; a page that does not exist is
# simply left out.
#
# Configured by ENV:
# - PLANT_PAGES_PROVIDER: web (default) | none
module Providers
  class PlantPages
    class Unavailable < StandardError; end

    # `quotable`: whether an excerpt of the page may be stored and shown.
    Page = Data.define(:key, :source, :url, :text, :quotable)

    USER_AGENT = Gbif::USER_AGENT
    MAX_CHARS = 12_000
    MAX_BYTES = 3_000_000
    OPEN_TIMEOUT = 5
    TIMEOUT = 15
    WIKIPEDIAS = %w[en fr].freeze

    KEEP_SECTIONS = /descri|morpho|character|cultiv|grow|ecolog|habitat|distribut|pollinat|reproduc|flower|fruit|uses|edib|hardi|propag|habit|culture|usage|biolog|écolog|floraison|utilis|caract/i
    SKIP_SECTIONS = /popular|in art|literat|film|music|myth|folklore|symbol|etymolog|étymolog|references|référence|see also|voir aussi|external|liens|further reading|notes/i

    def self.build(env = ENV)
      new(available: env.fetch("PLANT_PAGES_PROVIDER", "web").to_s.strip.downcase == "web")
    end

    def initialize(available: true, connection: nil)
      @available = available
      @connection = connection
    end

    def available? = @available

    def for(latin_name)
      return [] unless available?

      [ -> { pfaf(latin_name) }, *WIKIPEDIAS.map { |lang| -> { wikipedia(latin_name, lang) } } ].filter_map do |fetch|
        fetch.call
      rescue Unavailable
        nil
      end
    end

    def pfaf(latin_name)
      url = "https://pfaf.org/user/Plant.aspx?LatinName=#{CGI.escape(latin_name.to_s.squish)}"
      doc = Nokogiri::HTML(get(url))
      return nil if doc.at_css("#ContentPlaceHolder1_lbldisplatinname")&.text.to_s.strip.blank?

      # PFAF's <br> separate blocks (« Edible Parts: Fruit Seed », then
      # « Edible Uses: … »): without them the two run into « SeedEdible ».
      doc.css("br").each { |br| br.replace("\n") }
      pick = ->(id) { doc.at_css("#ContentPlaceHolder1_#{id}")&.text.to_s.gsub(/[ \t ]+/, " ").gsub(/\s*\n\s*/, "\n").strip }
      parts = []
      parts << "USDA hardiness zones: #{pick.('lblUSDAhardiness')}." if pick.("lblUSDAhardiness").present?
      parts << pick.("lblPhystatment")
      parts << "Habitats in the garden: #{pick.('lblhabitats')}." if pick.("lblhabitats").present?
      parts << pick.("txtEdibleUses")
      parts << pick.("txtCultivationDetails")
      parts << pick.("txtSpecialUses")
      text = clean(parts.compact_blank.join("\n"))
      text.present? ? Page.new(key: "pfaf", source: "pfaf", url:, text:, quotable: false) : nil
    end

    # The plain text of the article, cut down to its introduction and
    # botanical sections: Jev judges less well when the state grows with text
    # unrelated to the question.
    def wikipedia(title, lang)
      data = JSON.parse(get("https://#{lang}.wikipedia.org/w/api.php", action: "query", prop: "extracts", explaintext: 1,
                                                                        redirects: 1, format: "json", titles: title.to_s.squish))
      page = data.dig("query", "pages")&.values&.first
      return nil if page.nil? || page.key?("missing") || page["extract"].to_s.length < 200

      parts = page["extract"].split(/^(==+ .+ ==+)$/)
      kept = [ parts.shift.to_s ]
      parts.each_slice(2) do |heading, body|
        heading = heading.to_s
        kept << "#{heading.delete('=').strip}.\n#{body}" if heading.match?(KEEP_SECTIONS) && !heading.match?(SKIP_SECTIONS)
      end
      url = "https://#{lang}.wikipedia.org/wiki/#{ERB::Util.url_encode(page['title'].tr(' ', '_'))}"
      Page.new(key: "wikipedia_#{lang}", source: "wikipedia", url:, text: clean(kept.join("\n")), quotable: true)
    rescue JSON::ParserError
      raise Unavailable, "garbled answer"
    end

    private
      def clean(text)
        text.to_s.gsub(/\[\d+(?:,\s*\d+)*\]|\[K\]/, "").gsub(/[ \t]+/, " ").gsub(/\n\s*\n+/, "\n").strip[0, MAX_CHARS]
      end

      def get(url, params = {})
        response = connection.get(url, params)
        raise Unavailable, "HTTP #{response.status}" unless response.success?
        raise Unavailable, "page too large" if response.body.to_s.bytesize > MAX_BYTES

        response.body.to_s.dup.force_encoding(Encoding::UTF_8).scrub
      rescue Faraday::Error => error
        raise Unavailable, error.class.name
      end

      def connection
        @connection ||= Faraday.new(request: { open_timeout: OPEN_TIMEOUT, timeout: TIMEOUT }) do |f|
          f.headers["User-Agent"] = USER_AGENT
          f.headers["Accept-Language"] = "en,fr;q=0.8"
        end
      end
  end
end

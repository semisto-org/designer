# Free photos of a species from Wikimedia Commons, found through Wikidata:
# the taxon whose scientific name (P225) is the species' latin name, and its
# image (P18). Commons only hosts free files (CC0, public domain, CC BY,
# CC BY-SA), so each one may be shown on a paid service as long as its author
# and licence are shown with it; the licence is still checked here, file by
# file, and anything else is skipped.
#
#   commons = Providers::WikimediaCommons.build
#   commons.available?                     # false when WIKIMEDIA_PROVIDER=none
#   commons.main_image("Mespilus germanica") # => Image or nil (no free image)
#   commons.download(image)                # => the JPEG/PNG bytes, at most 1600 px wide
#
# Raises Providers::WikimediaCommons::Unavailable (rate limited, timeout,
# garbled answer) instead of answering « no image », so the caller tries again
# later rather than recording a miss.
#
# Configured by ENV:
# - WIKIMEDIA_PROVIDER: commons (default) | none
#
# Wikimedia asks for a User-Agent with a contact and for requests one after
# the other: callers fetch species in sequence (PlantPhotoJob.backfill).
module Providers
  class WikimediaCommons
    class Unavailable < StandardError; end

    Image = Data.define(:file_title, :thumb_url, :page_url, :author, :license, :license_url, :width, :height)

    SPARQL_URL = "https://query.wikidata.org/sparql".freeze
    COMMONS_API = "https://commons.wikimedia.org/w/api.php".freeze
    THUMB_WIDTH = 1600
    MAX_BYTES = 15.megabytes
    MIME_TYPES = %w[image/jpeg image/png image/webp].freeze
    # The licences Commons uses for free files, by their short name.
    FREE_LICENSE = /\A(cc0( 1\.0)?|cc by(-sa)?( \d\.\d)?( [a-z]{2,3})?|public domain|pd-[\w-]+|attribution|no restrictions)\z/i
    # Botanical plates and herbarium sheets are kept for when no photo exists.
    NOT_A_PHOTO = /k[öo]hler|illustration|plate|drawing|herbarium|herbier|tafel|\.svg\z|\.tiff?\z/i
    OPEN_TIMEOUT = 5
    TIMEOUT = 20
    USER_AGENT = "SemistoTerranova/1.0 (+https://terranova.semisto.org; hello@semisto.org)".freeze

    def self.build(env = ENV)
      new(available: env.fetch("WIKIMEDIA_PROVIDER", "commons").to_s.strip.downcase == "commons")
    end

    def initialize(available: true, connection: nil)
      @available = available
      @connection = connection
    end

    def available? = @available

    def attribution = "Wikimedia Commons"

    # The species' Wikidata image, else its next free one; nil when none.
    def main_image(latin_name)
      raise Unavailable, "not configured" unless available?

      titles = image_titles(latin_name)
      titles.sort_by { |title| title.match?(NOT_A_PHOTO) ? 1 : 0 }.each do |title|
        image = image_info(title)
        return image if image
      end
      nil
    end

    def download(image)
      response = connection.get(image.thumb_url)
      raise Unavailable, "HTTP #{response.status}" unless response.success?
      raise Unavailable, "too large" if response.body.bytesize > MAX_BYTES

      response.body
    rescue Faraday::Error => error
      raise Unavailable, error.class.name
    end

    private
      # Commons file titles (without « File: »), in Wikidata's order. Hybrids
      # are written « Mentha ×piperita » there, without the space.
      def image_titles(latin_name)
        names = [ latin_name.to_s.squish, latin_name.to_s.squish.gsub(/× /, "×") ].uniq
        values = names.map { |name| %("#{name.gsub(/["\\]/, '')}") }.join(" ")
        query = "SELECT ?img WHERE { VALUES ?name { #{values} } ?taxon wdt:P225 ?name; wdt:P18 ?img }"
        body = get_json(SPARQL_URL, query:, format: "json")
        bindings = body.dig("results", "bindings")
        raise Unavailable, "garbled Wikidata answer" unless bindings.is_a?(Array)

        bindings.filter_map do |row|
          url = row.dig("img", "value").to_s
          CGI.unescape(url.split("Special:FilePath/").last.to_s).tr("_", " ").presence if url.include?("Special:FilePath/")
        end.uniq
      end

      def image_info(title)
        body = get_json(COMMONS_API, action: "query", format: "json", formatversion: 2, prop: "imageinfo",
                        iiprop: "url|size|mime|extmetadata", iiurlwidth: THUMB_WIDTH,
                        iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl", titles: "File:#{title}")
        page = Array(body.dig("query", "pages")).first
        info = Array(page&.dig("imageinfo")).first
        return nil unless info && MIME_TYPES.include?(info["mime"])

        meta = info["extmetadata"] || {}
        license = text(meta.dig("LicenseShortName", "value"))
        return nil unless license&.match?(FREE_LICENSE)

        Image.new(
          file_title: title, thumb_url: info["thumburl"].presence || info["url"], page_url: info["descriptionurl"],
          author: text(meta.dig("Artist", "value"))&.truncate(200), license:,
          license_url: meta.dig("LicenseUrl", "value").presence, width: info["width"], height: info["height"]
        )
      end

      # Commons writes the author as HTML (a link to their user page).
      def text(html) = html && ActionController::Base.helpers.strip_tags(html.to_s).squish.presence

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

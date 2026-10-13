require "resolv"
require "ipaddr"

module Mcp
  # Fetches a file the AI names by its HTTPS URL (a public Drive file, a
  # share link…) for import_from_url, without letting that URL reach the
  # server's own network: HTTPS on port 443 only, every address the name
  # resolves to must be public, the connection goes to the address that was
  # checked (no second lookup), redirects are checked the same way, and the
  # download stops at `max_bytes`.
  class RemoteFile
    MAX_REDIRECTS = 3
    OPEN_TIMEOUT = 5
    READ_TIMEOUT = 30
    BLOCKED = %w[
      0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24
      192.168.0.0/16 198.18.0.0/15 224.0.0.0/4 240.0.0.0/4 ::/128 ::1/128 fc00::/7 fe80::/10 ff00::/8
    ].map { IPAddr.new(_1) }.freeze

    Fetched = Data.define(:io, :filename, :content_type)

    # code: a stable name for the AI (see FileAttacher::Refused).
    class Error < StandardError
      attr_reader :code

      def initialize(code, message = code)
        @code = code
        super(message)
      end
    end

    class_attribute :resolver, default: ->(host) { Resolv.getaddresses(host) }

    def self.fetch(url, max_bytes:) = new(max_bytes:).fetch(url)

    # Tests: names resolve to the addresses the block gives.
    def self.stub_resolver(stub)
      previous = resolver
      self.resolver = stub
      yield
    ensure
      self.resolver = previous
    end

    def initialize(max_bytes:)
      @max_bytes = max_bytes
    end

    def fetch(url, redirects = 0)
      uri = checked_uri(drive_download(url))
      response, body = get(uri)
      case response
      when Net::HTTPRedirection
        raise Error, "too_many_redirects" if redirects >= MAX_REDIRECTS
        fetch(URI.join(uri, response["location"].to_s).to_s, redirects + 1)
      when Net::HTTPSuccess
        type = response.content_type.to_s.downcase
        # A share page or a sign-in page, not the file itself.
        raise Error, "not_a_file" if type == "text/html"
        Fetched.new(io: body, filename: filename(response, uri), content_type: type.presence || "application/octet-stream")
      else
        raise Error, "http_#{response.code}"
      end
    end

    private
      # A Drive « view » link becomes its download link.
      def drive_download(url)
        id = url[%r{\Ahttps://drive\.google\.com/file/d/([\w-]+)}, 1] || url[%r{\Ahttps://drive\.google\.com/open\?id=([\w-]+)}, 1]
        id ? "https://drive.google.com/uc?export=download&id=#{id}" : url
      end

      def checked_uri(url)
        uri = URI.parse(url)
        raise Error, "https_only" unless uri.is_a?(URI::HTTPS) && uri.host.present? && uri.port == 443 && uri.userinfo.nil?
        uri
      rescue URI::InvalidURIError
        raise Error, "invalid_url"
      end

      # The first public address of the host; any private one refuses it all.
      def address_for(host)
        addresses = Array(resolver.call(host))
        raise Error, "unresolved" if addresses.empty?
        ips = addresses.map { IPAddr.new(_1.to_s) }
        raise Error, "private_address" if ips.any? { |ip| blocked?(ip) }
        ips.first.to_s
      rescue IPAddr::InvalidAddressError
        raise Error, "unresolved"
      end

      def blocked?(ip)
        ip = ip.native if ip.ipv4_mapped?
        BLOCKED.any? { |range| range.family == ip.family && range.include?(ip) }
      end

      def get(uri)
        http = Net::HTTP.new(uri.host, 443)
        http.ipaddr = address_for(uri.host)
        http.use_ssl = true
        http.open_timeout = OPEN_TIMEOUT
        http.read_timeout = READ_TIMEOUT
        body = Tempfile.new([ "mcp-import", File.extname(uri.path) ], binmode: true)
        response = http.start do |connection|
          connection.request(Net::HTTP::Get.new(uri, "User-Agent" => "SemistoDesigner/1.0")) do |res|
            next unless res.is_a?(Net::HTTPSuccess)
            raise Error, "too_large" if res["content-length"].to_i > @max_bytes
            size = 0
            res.read_body do |chunk|
              size += chunk.bytesize
              raise Error, "too_large" if size > @max_bytes
              body.write(chunk)
            end
          end
        end
        body.rewind
        [ response, body ]
      rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, OpenSSL::SSL::SSLError, Errno::ECONNREFUSED, Errno::ECONNRESET, Errno::EHOSTUNREACH
        raise Error, "unreachable"
      end

      def filename(response, uri)
        disposition = response["content-disposition"].to_s
        name = disposition[/filename\*=UTF-8''([^;]+)/i, 1]&.then { CGI.unescape(_1) } || disposition[/filename="?([^";]+)"?/i, 1]
        name ||= File.basename(CGI.unescape(uri.path.to_s))
        name = name.to_s.strip
        name.present? && name != "/" ? name.first(200) : "fichier"
      end
  end
end

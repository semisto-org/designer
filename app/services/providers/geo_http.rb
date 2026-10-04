# Outbound HTTP for the map data providers (tile relay, identify, cadastre,
# geocoder): Faraday with short timeouts, a host allow-list for everything
# whose URL comes from the database, and a small circuit breaker so a dead
# upstream does not pin every Puma thread on timeouts.
module Providers
  module GeoHttp
    class Error < StandardError; end
    # The upstream did not answer, answered an error, or is short-circuited.
    class Unavailable < Error; end
    # The URL is not on the allow-list: never fetched.
    class Forbidden < Error; end

    # Hosts the relay may contact (URLs read from region_layers). Extend
    # with MAP_RELAY_EXTRA_HOSTS (comma separated) when a region adds a
    # provider; never make this an open proxy.
    RELAY_HOSTS = %w[
      geoservices.wallonie.be
      data.geopf.fr apicarto.ign.fr
      wmts1.geoportail.lu wms.geoportail.lu wms.inspire.geoportail.lu
      bio.discomap.eea.europa.eu image.discomap.eea.europa.eu
      maps.isric.org
    ].freeze

    OPEN_TIMEOUT = 3
    TIMEOUT = 8

    # Breaker: after FAILURES failures within WINDOW seconds on one service,
    # calls fail fast for WINDOW seconds.
    FAILURES = 5
    WINDOW = 60

    USER_AGENT = "SemistoDesigner/1.0 (+https://designer.semisto.org)".freeze

    module_function

    def relay_hosts
      RELAY_HOSTS + ENV.fetch("MAP_RELAY_EXTRA_HOSTS", "").split(",").map(&:strip).reject(&:empty?)
    end

    def allowed?(url)
      # Tile templates carry {z}/{x}/{y} placeholders, not valid in a URI.
      uri = URI.parse(url.to_s.gsub(/\{[a-z0-9-]+\}/i, "0"))
      uri.is_a?(URI::HTTPS) && relay_hosts.include?(uri.host)
    rescue URI::InvalidURIError
      false
    end

    def ensure_allowed!(url)
      raise Forbidden, "host not allowed: #{url}" unless allowed?(url)
    end

    # GET and return the Faraday response (2xx only). Raises Unavailable.
    # Timeouts and 5xx count against the breaker; 4xx do not (a missing
    # tile is not a broken service).
    def get(url, params: {}, headers: {}, timeout: TIMEOUT, breaker: true)
      key = breaker_key(url)
      failures = breaker ? Rails.cache.read(key).to_i : 0
      raise Unavailable, "circuit open for #{url}" if failures >= FAILURES

      begin
        response = connection(timeout:).get(url, params, { "User-Agent" => USER_AGENT }.merge(headers))
      rescue Faraday::Error => error
        failed(key) if breaker
        raise Unavailable, error.message
      end
      unless response.success?
        failed(key) if breaker && response.status >= 500
        raise Unavailable, "HTTP #{response.status}"
      end
      Rails.cache.delete(key) if failures.positive?
      response
    end

    def get_json(url, **)
      body = get(url, **).body
      JSON.parse(body)
    rescue JSON::ParserError => error
      raise Unavailable, "invalid JSON: #{error.message}"
    end

    def connection(timeout:)
      Faraday.new(request: { open_timeout: [ OPEN_TIMEOUT, timeout ].min, timeout: }) do |f|
        f.adapter Faraday.default_adapter
      end
    end

    # One breaker per upstream service (host + path), not per host: one
    # broken SPW service must not hide the others.
    def breaker_key(url)
      uri = URI.parse(url.to_s)
      "providers/breaker/#{Digest::SHA1.hexdigest("#{uri.host}#{uri.path}")[0, 16]}"
    rescue URI::InvalidURIError
      "providers/breaker/invalid"
    end

    def failed(key)
      Rails.cache.increment(key, 1, expires_in: WINDOW) || Rails.cache.write(key, 1, expires_in: WINDOW)
    end
  end
end

# Sends people from an old host name (designer.semisto.org) to the current
# one (AppHosts.primary), same path and query, with a permanent redirect.
#
# Only page visits move (GET and HEAD). What machines call keeps answering
# on the old host, so nothing connected before the move breaks: the MCP
# server and its OAuth endpoints (an AI connector stores its URL, its tokens
# name the old host as their resource), the phone app's /api and sign-in,
# webhooks (Stripe, Tally: POST) and the health check.
class LegacyHostRedirect
  KEPT_PREFIXES = %w[/mcp /oauth/ /.well-known/ /api/ /up].freeze

  def initialize(app)
    @app = app
  end

  def call(env)
    request = Rack::Request.new(env)
    return @app.call(env) unless redirect?(request)

    location = "https://#{AppHosts.primary}#{request.fullpath}"
    [ 301, { "location" => location, "content-type" => "text/html", "cache-control" => "public, max-age=86400" }, [] ]
  end

  private
    def redirect?(request)
      (request.get? || request.head?) &&
        AppHosts.legacy?(request.host) &&
        KEPT_PREFIXES.none? { |prefix| request.path == prefix.chomp("/") || request.path.start_with?(prefix) }
    end
end

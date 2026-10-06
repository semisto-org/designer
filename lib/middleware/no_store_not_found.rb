# Marks every 404 as not storable.
#
# Rails' static error pages carry no Cache-Control, so Cloudflare adds its
# default browser TTL (4 hours) to them. During a deploy, a browser can ask the
# old container for a chunk of the new build (or the reverse): that 404 then
# stayed in the browser's cache for hours and every page came up blank.
class NoStoreNotFound
  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    headers["cache-control"] = "no-store" if status.to_i == 404
    [ status, headers, body ]
  end
end

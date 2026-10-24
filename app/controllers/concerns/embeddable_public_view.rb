# A published map may be shown inside an <iframe> on the sites listed in
# PUBLIC_MAP_FRAME_ANCESTORS (space-separated origins). Rails answers
# `X-Frame-Options: SAMEORIGIN` everywhere else, which no single origin can
# widen: these views swap it for a CSP `frame-ancestors` naming the allowed
# sites. Only the read-only public views include this; the editor, accounts and
# every page with an action stay unframeable.
#
# The default lets Les 4 Sources show its domain map in Claudy, its internal
# app (app.les4sources.be). Set the variable to an empty string to forbid
# every embedding again.
module EmbeddablePublicView
  extend ActiveSupport::Concern

  DEFAULT_FRAME_ANCESTORS = "https://app.les4sources.be".freeze

  included do
    after_action :allow_embedding
  end

  def self.frame_ancestors
    origins = ENV.fetch("PUBLIC_MAP_FRAME_ANCESTORS", DEFAULT_FRAME_ANCESTORS).split
    origins.select { |origin| origin.match?(%r{\Ahttps://[a-z0-9.-]+(:\d+)?\z}i) }
  end

  private
    def allow_embedding
      origins = EmbeddablePublicView.frame_ancestors
      return if origins.empty?

      response.headers.delete("X-Frame-Options")
      directive = "frame-ancestors 'self' #{origins.join(' ')}"
      existing = response.headers["Content-Security-Policy"].presence
      response.set_header("Content-Security-Policy", [ existing, directive ].compact.join("; "))
    end
end

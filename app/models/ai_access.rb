# What an AI client may do on the user's maps, as OAuth scopes. Reading is
# always granted; posting drafts is an extra scope the user chooses on the
# consent page (or when creating a personal token). The map role and the
# owner's plan still apply on top of the scope.
module AiAccess
  READ = "maps:read"
  DRAFTS = "maps:drafts"
  SCOPES = [ READ, DRAFTS ].freeze
  # Full account access for Semisto's own mobile app (MobileApp), never
  # offered on the consent page nor to any other client (approved by
  # Michael, 2026-10-04).
  APP = "app"
  KNOWN = (SCOPES + [ APP ]).freeze
  LEVELS = { "read" => [ READ ], "drafts" => [ READ, DRAFTS ] }.freeze

  # Known scopes from a space-separated string or array, read always included.
  def self.normalize(scopes)
    list = (scopes.is_a?(String) ? scopes.split : Array(scopes)).map(&:to_s) & KNOWN
    ([ READ ] + list).uniq.sort_by { |scope| KNOWN.index(scope) }
  end

  # Scopes a client may not ask for. APP is in it on purpose: only the
  # authorization endpoint grants it, to MobileApp, and nobody can request
  # it at refresh or on a personal token.
  def self.unknown(scopes)
    (scopes.is_a?(String) ? scopes.split : Array(scopes)).map(&:to_s) - SCOPES
  end

  def self.level(scopes)
    normalize(scopes).include?(DRAFTS) ? "drafts" : "read"
  end

  def self.scopes_for(level)
    LEVELS.fetch(level.to_s) { LEVELS["read"] }
  end
end

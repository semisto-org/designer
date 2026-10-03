# What an AI client may do on the user's maps, as OAuth scopes. Reading is
# always granted; posting drafts is an extra scope the user chooses on the
# consent page (or when creating a personal token). The map role and the
# owner's plan still apply on top of the scope.
module AiAccess
  READ = "maps:read"
  DRAFTS = "maps:drafts"
  SCOPES = [ READ, DRAFTS ].freeze
  LEVELS = { "read" => [ READ ], "drafts" => [ READ, DRAFTS ] }.freeze

  # Known scopes from a space-separated string or array, read always included.
  def self.normalize(scopes)
    list = (scopes.is_a?(String) ? scopes.split : Array(scopes)).map(&:to_s) & SCOPES
    ([ READ ] + list).uniq.sort_by { |scope| SCOPES.index(scope) }
  end

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

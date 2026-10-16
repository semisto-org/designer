# The public host names of the app. Since 16 October 2026 the product is
# Semisto Terranova at terranova.semisto.org; designer.semisto.org, its first
# address, keeps answering (LegacyHostRedirect). APP_HOST overrides the
# primary host, LEGACY_HOSTS (comma-separated) the old ones.
module AppHosts
  PRIMARY = "terranova.semisto.org".freeze
  LEGACY = %w[designer.semisto.org].freeze

  def self.primary
    ENV["APP_HOST"].to_s.strip.then { |host| host.empty? ? PRIMARY : host }
  end

  def self.legacy
    hosts = ENV["LEGACY_HOSTS"] ? ENV["LEGACY_HOSTS"].split(",").map(&:strip).reject(&:empty?) : LEGACY
    hosts - [ primary ]
  end

  def self.legacy?(host) = legacy.include?(host.to_s.downcase)
end

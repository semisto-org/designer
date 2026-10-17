module ApplicationHelper
  # Browser error tracking reads its settings from these tags at runtime
  # (app/frontend/lib/sentry.ts), so the same image works with or without
  # SENTRY_DSN and the DSN never has to exist at build time.
  def sentry_meta_tags(env = ENV)
    dsn = env["SENTRY_DSN"].presence
    return if dsn.blank?

    safe_join([
      tag.meta(name: "sentry-dsn", content: dsn),
      tag.meta(name: "sentry-environment", content: env.fetch("SENTRY_ENVIRONMENT", Rails.env))
    ], "\n")
  end

  # Audience measurement with Semisto's self-hosted Plausible: no cookie, no
  # personal data. Off unless PLAUSIBLE_DOMAIN names the site as registered in
  # Plausible. The script follows Inertia's client-side navigations by itself.
  def plausible_script_tag(env = ENV)
    domain = env["PLAUSIBLE_DOMAIN"].presence
    return if domain.blank?

    tag.script(defer: true, data: { domain: domain }, src: env["PLAUSIBLE_SCRIPT_URL"].presence || "https://stats.semisto.org/js/script.js")
  end
end

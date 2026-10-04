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
end

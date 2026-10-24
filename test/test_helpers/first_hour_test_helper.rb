# Sentry's browser recording is on when SENTRY_DSN is set; these tests set it
# (and SENTRY_REPLAY_SESSIONS, SENTRY_ORG) for a block, then put ENV back.
module FirstHourTestHelper
  REPLAY_ID = "a" * 32

  def with_replay_env(values = {})
    values = { "SENTRY_DSN" => "https://key@o1.ingest.sentry.io/2" }.merge(values)
    previous = values.keys.index_with { ENV[_1] }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
  end

  def replay_id(n) = n.to_s.rjust(32, "0")
end

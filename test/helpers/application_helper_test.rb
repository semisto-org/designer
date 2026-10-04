require "test_helper"

class ApplicationHelperTest < ActionView::TestCase
  test "no Sentry tags without a DSN" do
    assert_nil sentry_meta_tags({})
    assert_nil sentry_meta_tags({ "SENTRY_DSN" => "" })
  end

  test "Sentry tags carry the DSN and environment for the browser" do
    html = sentry_meta_tags({ "SENTRY_DSN" => "https://key@o1.ingest.sentry.io/2", "SENTRY_ENVIRONMENT" => "production" })
    assert_includes html, '<meta name="sentry-dsn" content="https://key@o1.ingest.sentry.io/2">'
    assert_includes html, '<meta name="sentry-environment" content="production">'
  end

  test "environment defaults to the Rails environment" do
    html = sentry_meta_tags({ "SENTRY_DSN" => "https://key@o1.ingest.sentry.io/2" })
    assert_includes html, %(<meta name="sentry-environment" content="#{Rails.env}">)
  end
end

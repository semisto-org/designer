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

  test "no Plausible script without a domain" do
    assert_nil plausible_script_tag({})
    assert_nil plausible_script_tag({ "PLAUSIBLE_DOMAIN" => "" })
  end

  test "Plausible script loads from Semisto's instance by default" do
    html = plausible_script_tag({ "PLAUSIBLE_DOMAIN" => "terranova.semisto.org" })
    assert_includes html, 'data-domain="terranova.semisto.org"'
    assert_includes html, 'src="https://stats.semisto.org/js/script.js"'
    assert_includes html, "defer"
  end

  test "Plausible script URL can be overridden" do
    html = plausible_script_tag({ "PLAUSIBLE_DOMAIN" => "terranova.semisto.org", "PLAUSIBLE_SCRIPT_URL" => "https://example.org/js/script.js" })
    assert_includes html, 'src="https://example.org/js/script.js"'
  end
end

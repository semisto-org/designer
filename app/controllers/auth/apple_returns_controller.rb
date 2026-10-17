# Apple's answer to « Continuer avec Apple » arrives as a cross-site POST
# (response_mode=form_post), which carries no SameSite=Lax cookie. This page
# re-posts it, unchanged, from our own origin to OmniAuth's callback, where
# the session (and the state OmniAuth stored in it) comes along.
#
# Deliberately outside ApplicationController and session-free: writing a
# session here would replace the one that holds OmniAuth's state.
module Auth
  class AppleReturnsController < ActionController::Base
    skip_forgery_protection

    FIELDS = %w[code state id_token user error].freeze

    def create
      fields = FIELDS.filter_map { |name| [ name, params[name] ] if params[name].is_a?(String) }
      inputs = fields.map { |name, value| helpers.hidden_field_tag(name, value, id: nil) }.join
      request.session_options[:skip] = true
      render html: <<~HTML.html_safe, layout: false
        <!doctype html>
        <html lang="fr">
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>#{ERB::Util.h(t("sessions.apple_return.title"))}</title></head>
          <body style="font-family: system-ui, sans-serif; padding: 3rem 1rem; text-align: center; color: #3a3330">
            <form method="post" action="/auth/apple/callback">#{inputs}
              <p>#{ERB::Util.h(t("sessions.apple_return.wait"))}</p>
              <noscript><button type="submit">#{ERB::Util.h(t("sessions.apple_return.continue"))}</button></noscript>
            </form>
            <script>document.forms[0].submit()</script>
          </body>
        </html>
      HTML
    end
  end
end

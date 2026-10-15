module Webhooks
  # POST /webhooks/tally/:token — an answer to one of a team's Tally forms
  # (FormInbox). No session, no CSRF: the address names the team and the
  # Tally-Signature header proves the body came from Tally with the team's
  # secret. 200 once the answer is kept (or was already), 401 for a missing
  # or wrong signature, 404 for an unknown address; Tally retries on 5xx.
  class TallyController < ActionController::API
    def create
      inbox = FormInbox.find_by(token: params[:token].to_s)
      return head :not_found unless inbox

      payload = request.raw_post
      return head :unauthorized unless inbox.signature_valid?(payload, request.headers["Tally-Signature"])

      event = JSON.parse(payload)
      response = Forms::Receive.new(inbox, event).call
      render json: { status: response ? (response.map_id ? "filed" : "unfiled") : "ignored" }
    rescue JSON::ParserError
      head :bad_request
    rescue StandardError => e
      Rails.error.report(e, handled: true, context: { form_inbox_id: inbox&.id })
      head :internal_server_error
    end
  end
end

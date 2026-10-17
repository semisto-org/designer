# The phone app sends each change from its outbox with an Idempotency-Key
# (the change's own id). When the answer is lost on a field connection, the
# app sends it again: the server answers with what it answered the first
# time instead of creating a second photo, plant or comment.
module IdempotentRequests
  extend ActiveSupport::Concern

  included do
    around_action :replay_idempotent_request, if: :idempotent_request?
  end

  private
    def idempotent_request?
      request.post? && idempotency_key.present? && mobile_app_token.present?
    end

    def idempotency_key
      request.headers["Idempotency-Key"].to_s.strip.first(100).presence
    end

    def replay_idempotent_request
      user = mobile_app_token.user
      if (done = IdempotentRequest.find_by(user:, key: idempotency_key))
        return render(body: done.body, status: done.status, content_type: "application/json")
      end
      yield
      IdempotentRequest.remember(user:, key: idempotency_key, response:) if response.successful?
    end
end

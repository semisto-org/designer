# Builds Tally webhook events (eventType FORM_RESPONSE) for the form tests.
module FormsTestHelper
  def tally_event(form_id: "w77j70", form_name: "Retour en fin de projet", response_id: "rsp1", map: nil, fields: nil)
    {
      "eventId" => "evt-#{response_id}", "eventType" => "FORM_RESPONSE", "createdAt" => "2026-10-14T09:00:00.000Z",
      "data" => {
        "responseId" => response_id, "submissionId" => response_id, "formId" => form_id, "formName" => form_name,
        "createdAt" => "2026-10-14T09:00:00.000Z",
        "fields" => [
          { "key" => "question_map", "label" => "carte", "type" => "HIDDEN_FIELDS", "value" => map&.id&.to_s },
          *(fields || [
            { "key" => "question_a", "label" => "Qu'avez-vous le plus apprécié ?", "type" => "TEXTAREA", "value" => "La visite du terrain" },
            { "key" => "question_b", "label" => "Votre note", "type" => "RATING", "value" => 5 }
          ])
        ]
      }
    }
  end

  def tally_signature(inbox, body) = Base64.strict_encode64(OpenSSL::HMAC.digest("SHA256", inbox.signing_secret, body))
end

ActiveSupport::TestCase.include FormsTestHelper
ActionDispatch::IntegrationTest.include FormsTestHelper

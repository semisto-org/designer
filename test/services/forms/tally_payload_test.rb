require "test_helper"
require_relative "../../test_helpers/forms_test_helper"

class Forms::TallyPayloadTest < ActiveSupport::TestCase
  test "reads the form, the response and the map reference" do
    payload = Forms::TallyPayload.new(tally_event(fields: []).deep_merge("data" => { "fields" => [ { "label" => "Carte", "type" => "HIDDEN_FIELDS", "value" => " 42 " } ] }))
    assert payload.response?
    assert_equal [ "w77j70", "Retour en fin de projet", "rsp1", "42" ], [ payload.form_id, payload.form_name, payload.response_id, payload.map_reference ]
    assert_equal Time.utc(2026, 10, 14, 9), payload.submitted_at
    assert_empty payload.fields, "the map's hidden field is not an answer"
  end

  test "writes every kind of answer as text, in order, without the empty ones" do
    options = [ { "id" => "o1", "text" => "Pommes" }, { "id" => "o2", "text" => "Poires" } ]
    fields = [
      { "label" => "Fruits", "type" => "CHECKBOXES", "value" => %w[o1 o2], "options" => options },
      { "label" => "Fruits (Pommes)", "type" => "CHECKBOXES", "value" => true },
      { "label" => "Préféré", "type" => "MULTIPLE_CHOICE", "value" => [ "o2" ], "options" => options },
      { "label" => "Ordre", "type" => "RANKING", "value" => %w[o2 o1], "options" => options },
      { "label" => "Note", "type" => "LINEAR_SCALE", "value" => 8.0 },
      { "label" => "Recommanderiez-vous ?", "type" => "CHECKBOX", "value" => true },
      { "label" => "Photo", "type" => "FILE_UPLOAD", "value" => [ { "name" => "verger.jpg", "url" => "https://storage.tally.so/x.jpg" } ] },
      { "label" => "Grille", "type" => "MATRIX", "value" => { "r1" => [ "c1" ] },
        "rows" => [ { "id" => "r1", "text" => "Accueil" } ], "columns" => [ { "id" => "c1", "text" => "Très bien" } ] },
      { "label" => "Commentaire", "type" => "TEXTAREA", "value" => "" },
      { "label" => "Source", "type" => "HIDDEN_FIELDS", "value" => "newsletter" }
    ]
    texts = Forms::TallyPayload.new(tally_event(fields:)).fields.map { [ _1.label, _1.value ] }
    assert_equal [
      [ "Fruits", "Pommes, Poires" ], [ "Préféré", "Poires" ], [ "Ordre", "1. Poires\n2. Pommes" ], [ "Note", "8" ],
      [ "Recommanderiez-vous ?", "Oui" ], [ "Photo", "verger.jpg : https://storage.tally.so/x.jpg" ],
      [ "Grille", "Accueil : Très bien" ], [ "Source", "newsletter" ]
    ], texts
  end

  test "anything else is not an answer" do
    refute Forms::TallyPayload.new({ "eventType" => "FORM_DELETED" }).response?
    refute Forms::TallyPayload.new([]).response?
  end
end

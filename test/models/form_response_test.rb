require "test_helper"
require_relative "../test_helpers/teams_test_helper"
require_relative "../test_helpers/forms_test_helper"

class FormResponseTest < ActiveSupport::TestCase
  setup do
    @team = make_team("Design Labs", admin: users(:michael))
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
    @inbox = FormInbox.for(@team)
  end

  test "an answer naming a team map is filed in its documents as Markdown" do
    response = Forms::Receive.new(@inbox, tally_event(map: @map)).call
    document = response.map_document
    assert_equal [ @map, "form", [ "Retour en fin de projet" ] ], [ document.map, document.origin, document.tags ]
    assert_equal "Retour en fin de projet · 14 octobre 2026", document.title
    text = document.file.download.force_encoding("UTF-8")
    assert_includes text, "## Qu'avez-vous le plus apprécié ?\n\nLa visite du terrain"
    assert_equal "Retour en fin de projet", document.as_inertia(url: ->(*) { "" })[:form][:formName]
  end

  test "the same response twice is kept once" do
    2.times { Forms::Receive.new(@inbox, tally_event(map: @map)).call }
    assert_equal 1, FormResponse.count
    assert_equal 1, @map.documents.count
  end

  test "an answer for a map outside the team waits to be filed" do
    other = Map.create!(name: "Ailleurs", owner: users(:alice), region: regions(:wallonia))
    response = Forms::Receive.new(@inbox, tally_event(map: other)).call
    assert_nil response.map
    assert_equal other.id.to_s, response.map_reference
    assert_raises(ActiveRecord::RecordInvalid) { response.file_in!(other) }
    assert_empty other.documents
  end

  test "filing again in another map moves the document" do
    response = Forms::Receive.new(@inbox, tally_event).call
    response.file_in!(@map)
    second = Map.create!(name: "Verger", owner: users(:michael), region: regions(:wallonia), organization: @team)
    response.file_in!(second)
    assert_empty @map.documents.reload
    assert_equal [ response.reload.map_document ], second.documents.to_a
  end

  test "the form takes Tally's name and its link fills the map" do
    form = Forms::Receive.new(@inbox, tally_event).call.form
    assert_equal "Retour en fin de projet", form.name
    assert_equal "https://tally.so/r/w77j70?carte=#{@map.id}", form.link_for(@map)
    assert_equal "w77j70", ExternalForm.tally_id("https://tally.so/forms/w77j70/edit")
    assert_equal "w77j70", ExternalForm.tally_id(" w77j70 ")
    assert_nil ExternalForm.tally_id("https://example.org/r/w77j70")
  end

  test "the signature is Tally's: Base64 HMAC-SHA256 of the body" do
    body = tally_event.to_json
    assert @inbox.signature_valid?(body, tally_signature(@inbox, body))
    refute @inbox.signature_valid?(body + " ", tally_signature(@inbox, body))
    refute @inbox.signature_valid?(body, nil)
    old = @inbox.signing_secret
    @inbox.reset!
    refute_equal old, @inbox.signing_secret
  end
end

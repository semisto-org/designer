require "test_helper"

class Maps::SiteVisitsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @key = "visit-#{SecureRandom.hex(6)}"
  end

  def note_params(text, theme)
    { feature: { layer: "notes", kind: "note_point", name: text, properties: { visit: @key, theme: },
                 geometry: { type: "Point", coordinates: [ 4.906, 50.341 ] } } }
  end

  test "a note sent with a visit's key begins the visit, closing it files the report and the tasks" do
    sign_in_as users(:michael)
    post map_features_path(@map), params: note_params("Fond très humide, drain ?", "question"), as: :json
    assert_response :created
    question_id = response.parsed_body["id"] || response.parsed_body.dig("properties", "id")
    assert_equal 1, @map.site_visits.count

    post map_site_visits_path(@map), params: { site_visit: { key: @key, started_at: 1.hour.ago.iso8601, ended_at: Time.current.iso8601, question_ids: [ question_id ] } }, as: :json
    assert_response :created
    body = response.parsed_body
    assert_equal 1, body.dig("visit", "notes")
    assert body["documentUrl"].end_with?("/maps/#{@map.id}/documents/#{body.dig("visit", "documentId")}")
    assert_equal 1, @map.tasks.where(title: "Fond très humide, drain ?").count

    post map_site_visits_path(@map), params: { site_visit: { key: @key, ended_at: Time.current.iso8601, question_ids: [ question_id ] } }, as: :json
    assert_response :created
    assert_equal 1, @map.site_visits.count
    assert_equal 1, @map.documents.where(id: body.dig("visit", "documentId")).count
    assert_equal 1, @map.tasks.where(title: "Fond très humide, drain ?").count
  end

  test "a visit closed without notes still has its report" do
    sign_in_as users(:michael)
    post map_site_visits_path(@map), params: { site_visit: { key: @key } }, as: :json
    assert_response :created
    assert_includes MapDocument.find(response.parsed_body.dig("visit", "documentId")).markdown_content, "Aucune note"
  end

  test "a viewer reads the visits but cannot close one" do
    @map.site_visits.create!(key: @key, started_at: 1.hour.ago, user: users(:michael))
    sign_in_as users(:alice)
    get map_site_visits_path(@map), as: :json
    assert_response :success
    assert_equal [ @key ], response.parsed_body["visits"].map { _1["key"] }
    post map_site_visits_path(@map), params: { site_visit: { key: @key } }, as: :json
    assert_response :forbidden
  end

  test "a malformed key is refused" do
    sign_in_as users(:michael)
    post map_site_visits_path(@map), params: { site_visit: { key: "no" } }, as: :json
    assert_response :unprocessable_entity
  end

  test "someone outside the map gets nothing" do
    sign_in_as users(:bob)
    get map_site_visits_path(@map), as: :json
    assert_response :not_found
  end
end

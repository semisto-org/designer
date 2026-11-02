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

  test "the recording of the walk lands in the documents, once, and the report and the track follow" do
    sign_in_as users(:michael)
    started = Time.zone.parse("2026-11-02 10:15")
    audio = fixture_file_upload("visit.m4a", "audio/mp4")
    post audio_map_site_visit_path(@map, @key), params: { site_visit: { audio:, started_at: started.iso8601, seconds: 2520 } }
    assert_response :created
    document = MapDocument.find(response.parsed_body["documentId"])
    assert_equal "Enregistrement audio de la visite du 02/11/2026", document.title
    assert_equal [ "Visite de terrain" ], document.tags
    assert_equal "audio", document.kind
    assert_equal "audio", document.preview
    assert_equal "visite-2026-11-02.m4a", document.file.filename.to_s
    assert_includes document.description, "42 min"

    # A second send (the answer was lost) files nothing more.
    post audio_map_site_visit_path(@map, @key), params: { site_visit: { audio: fixture_file_upload("visit.m4a", "audio/mp4"), started_at: started.iso8601 } }
    assert_response :created
    assert_equal document.id, response.parsed_body["documentId"]
    assert_equal 1, @map.documents.where(title: document.title).count

    track = [ [ 4.9060, 50.3410 ], [ 4.9070, 50.3410 ], [ 4.9070, 50.3420 ] ]
    post map_site_visits_path(@map), params: { site_visit: { key: @key, started_at: started.iso8601, ended_at: (started + 45.minutes).iso8601, track: } }, as: :json
    assert_response :created
    visit = @map.site_visits.find_by!(key: @key)
    assert_equal document, visit.audio_document
    assert_equal 3, visit.track.num_points
    assert_in_delta 182, visit.track_m, 3
    report = visit.map_document.markdown_content
    assert_includes report, "« Enregistrement audio de la visite du 02/11/2026 »"
    assert_includes report, "182 m parcourus"
    assert_equal visit.track_m, response.parsed_body.dig("visit", "trackM")
  end

  test "a viewer cannot send a recording" do
    sign_in_as users(:alice)
    post audio_map_site_visit_path(@map, @key), params: { site_visit: { audio: fixture_file_upload("visit.m4a", "audio/mp4") } }, headers: { "Accept" => "application/json" }
    assert_response :forbidden
    assert_not @map.site_visits.exists?(key: @key)
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

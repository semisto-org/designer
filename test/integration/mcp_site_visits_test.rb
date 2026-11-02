require "test_helper"
require "test_helpers/mcp_test_helper"

# The user's AI reads the walks made with the phone: the report, the audio
# recording of the walk (not transcribed yet) and the track.
class McpSiteVisitsTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @viewer = personal_token(users(:alice))
    @visit = @map.site_visits.create!(key: "visit-#{SecureRandom.hex(6)}", started_at: Time.zone.parse("2026-11-02 10:15"), user: users(:michael))
    audio = Rack::Test::UploadedFile.new(file_fixture("visit.m4a"), "audio/mp4")
    @audio = @visit.attach_audio!(audio, seconds: 2520, by: users(:michael))
    @visit.close!(ended_at: Time.zone.parse("2026-11-02 11:00"), by: users(:michael), track: [ [ 4.906, 50.341 ], [ 4.907, 50.341 ] ])
  end

  test "list_site_visits gives the report, the recording and the track of each walk" do
    data, error = call_tool(@viewer, "list_site_visits", { map_id: @map.id, include_tracks: true })
    refute error, data
    visit = data["visits"].sole
    assert_equal @visit.key, visit["key"]
    assert_equal @visit.map_document_id, visit.dig("report", "document_id")
    assert_equal({ "document_id" => @audio.id, "title" => "Enregistrement audio de la visite du 02/11/2026", "seconds" => 2520, "transcribed" => false }, visit["audio"])
    assert_equal "LineString", visit.dig("track", "geometry", "type")
    assert_in_delta 71, visit.dig("track", "length_m"), 2
    assert_equal "list_site_visits", AiAction.last.tool

    data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_equal({ "count" => 1, "with_audio" => 1, "last_started_at" => @visit.started_at.iso8601 }, data["site_visits"])
  end

  test "get_document says a recording cannot be listened to yet" do
    data, error = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: @audio.id })
    refute error, data
    assert_equal "audio", data["kind"]
    assert_match "ne le transcrit pas encore", data["reason"]
  end
end

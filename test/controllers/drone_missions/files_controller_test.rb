require "test_helper"
require "test_helpers/drone_pilots_test_helper"

class DroneMissions::FilesControllerTest < ActionDispatch::IntegrationTest
  include DronePilotsTestHelper

  setup do
    @mission = paid_mission(pilot: create_pilot(users(:bob)), client: users(:michael), map: maps(:ahinvaux))
  end

  test "the pilot of a paid mission announces a file; anyone else cannot" do
    sign_in_as users(:michael)
    post drone_mission_files_path(@mission), params: { file: { filename: "nuage.laz", byte_size: 1_000 } }, as: :json
    assert_response :forbidden

    sign_in_as users(:bob)
    post drone_mission_files_path(@mission), params: { file: { filename: "nuage.laz", byte_size: 1_000 } }, as: :json
    assert_response :created
    assert_equal McpUpload::MISSION_FILE, McpUpload.last.kind
    assert response.parsed_body.dig("upload", "partsUrl").present?
  end

  test "an unknown format is refused" do
    sign_in_as users(:bob)
    post drone_mission_files_path(@mission), params: { file: { filename: "virus.exe", byte_size: 1_000 } }, as: :json
    assert_response :unprocessable_content
    assert_match ".laz", response.parsed_body["message"]
  end

  test "the client downloads a delivered file" do
    @mission.files.attach(io: StringIO.new("x,y,z"), filename: "points.csv")
    sign_in_as users(:michael)
    get drone_mission_file_path(@mission, @mission.files.first)
    assert_response :redirect
  end
end

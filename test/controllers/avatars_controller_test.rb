require "test_helper"

class AvatarsControllerTest < ActionDispatch::IntegrationTest
  test "serves a person's picture to anyone who has its link" do
    user = users(:michael)
    user.avatar.attach(fixture_file_upload("plant.png", "image/png"))
    get user.avatar_url
    assert_response :redirect
    assert_match %r{/rails/active_storage/}, response.location
  end

  test "answers 404 for an unknown key or a blob that is not an avatar" do
    get avatar_path("nope")
    assert_response :not_found

    note = ActiveStorage::Blob.create_and_upload!(io: file_fixture("plant.png").open, filename: "plant.png", content_type: "image/png")
    get avatar_path(note.signed_id)
    assert_response :not_found
  end
end

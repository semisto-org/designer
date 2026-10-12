require "test_helper"

class Account::AvatarsControllerTest < ActionDispatch::IntegrationTest
  setup { @user = users(:michael) }

  test "uploads a picture that then wins over the Google one" do
    @user.update!(avatar_url: "https://lh3.googleusercontent.com/me.jpg")
    sign_in_as @user
    patch account_avatar_path, params: { user: { avatar: fixture_file_upload("terrain.jpg", "image/jpeg") } }
    assert_redirected_to account_path
    assert @user.reload.avatar.attached?
    assert_equal avatar_path(@user.avatar.blob.signed_id), @user.avatar_url
    assert_equal @user.avatar_url, @user.as_inertia[:avatarUrl]
  end

  test "converts a HEIC picture from an iPhone" do
    sign_in_as @user
    patch account_avatar_path, params: { user: { avatar: fixture_file_upload("terrain_gps.heic", "image/heic") } }
    assert_equal "image/jpeg", @user.reload.avatar.blob.content_type
  end

  test "refuses a file that is not an image, and a missing one" do
    sign_in_as @user
    patch account_avatar_path, params: { user: { avatar: fixture_file_upload("notes.txt", "text/plain") } }
    assert_redirected_to account_path
    assert_not @user.reload.avatar.attached?
    patch account_avatar_path, params: { user: { name: "x" } }
    assert_not @user.reload.avatar.attached?
  end

  test "removing it falls back to the Google picture" do
    @user.update!(avatar_url: "https://lh3.googleusercontent.com/me.jpg")
    @user.avatar.attach(fixture_file_upload("plant.png", "image/png"))
    sign_in_as @user
    delete account_avatar_path
    assert_redirected_to account_path
    assert_not @user.reload.avatar.attached?
    assert_equal "https://lh3.googleusercontent.com/me.jpg", @user.avatar_url
  end

  test "needs a session" do
    patch account_avatar_path, params: { user: { avatar: fixture_file_upload("plant.png", "image/png") } }
    assert_not @user.reload.avatar.attached?
  end
end

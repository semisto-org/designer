require "test_helper"

class Admin::ReleaseNotesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @note = ReleaseNote.create!(title: "Brouillon", body: "Texte.", published_on: Date.current)
  end

  def params(**overrides)
    { release_note: { title: "Des étiquettes", body: "Pose-les.", published_on: "2026-10-06", published: "1" }.merge(overrides) }
  end

  test "regular users get a 404 everywhere" do
    sign_in_as users(:alice)
    get admin_release_notes_path
    assert_response :not_found
    assert_no_difference("ReleaseNote.count") { post admin_release_notes_path, params: params }
    assert_response :not_found
    patch admin_release_note_path(@note), params: params
    assert_response :not_found
    delete admin_release_note_path(@note)
    assert_response :not_found
  end

  test "lists drafts too, with their thumbs up" do
    sign_in_as @admin
    get admin_release_notes_path, headers: inertia_headers
    assert_response :success
    note = response.parsed_body["props"]["notes"].first
    assert_equal [ "Brouillon", false, 0 ], note.values_at("title", "published", "likesCount")
  end

  test "creates a published entry with a screenshot" do
    sign_in_as @admin
    png = Rack::Test::UploadedFile.new(StringIO.new(Base64.decode64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")), "image/png", original_filename: "s.png")
    assert_difference("ReleaseNote.count") { post admin_release_notes_path, params: params(screenshot: png) }
    assert_redirected_to admin_release_notes_path
    note = ReleaseNote.order(:id).last
    assert note.published?
    assert note.screenshot.attached?
    assert_equal @admin, note.created_by
  end

  test "invalid entries come back with errors" do
    sign_in_as @admin
    assert_no_difference("ReleaseNote.count") { post admin_release_notes_path, params: params(title: "", link_path: "https://x.org") }
    assert_redirected_to new_admin_release_note_path
  end

  test "publishing keeps its moment; unpublishing takes it back to draft" do
    sign_in_as @admin
    patch admin_release_note_path(@note), params: params(title: "Publiée")
    first = @note.reload.published_at
    assert first
    travel 1.hour do
      patch admin_release_note_path(@note), params: params(title: "Corrigée")
    end
    assert_equal first.to_i, @note.reload.published_at.to_i
    assert_equal "Corrigée", @note.title
    patch admin_release_note_path(@note), params: params(published: "0")
    assert_nil @note.reload.published_at
  end

  test "deletes an entry" do
    sign_in_as @admin
    assert_difference("ReleaseNote.count", -1) { delete admin_release_note_path(@note) }
  end
end

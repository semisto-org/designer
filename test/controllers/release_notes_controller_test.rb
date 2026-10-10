require "test_helper"

class ReleaseNotesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:alice)
    @user.update_columns(created_at: 10.days.ago, release_notes_seen_at: 2.days.ago)
    @old = ReleaseNote.create!(title: "Ancienne", body: "Texte.", published_on: 5.days.ago.to_date, published_at: 5.days.ago)
    @new = ReleaseNote.create!(title: "Nouvelle", body: "Texte.", published_on: Date.current, published_at: 1.hour.ago, link_path: "/help/x", link_label: "Lire l'aide")
    @draft = ReleaseNote.create!(title: "Brouillon", body: "Texte.", published_on: Date.current)
  end

  def props = response.parsed_body["props"]

  test "requires sign in" do
    get release_notes_path
    assert_redirected_to new_session_path
  end

  test "lists published entries newest first, marks the fresh ones, then marks everything seen" do
    @new.likes.create!(user: users(:bob))
    @new.likes.create!(user: @user)
    sign_in_as @user
    get release_notes_path, headers: inertia_headers
    assert_response :success
    assert_equal "release_notes/index", response.parsed_body["component"]
    notes = props["notes"]
    assert_equal %w[Nouvelle Ancienne], notes.map { _1["title"] }
    assert_equal [ true, false ], notes.map { _1["fresh"] }
    assert_equal [ "Bob", "Alice" ], notes.first["likes"].map { _1["name"] }
    assert_equal 2, notes.first["likesCount"]
    assert notes.first["liked"]
    assert_not notes.last["liked"]
    assert_equal({ "path" => "/help/x", "label" => "Lire l'aide" }, notes.first["link"])
    assert_in_delta Time.current, @user.reload.release_notes_seen_at, 5
  end

  test "shares the unseen count and the latest unseen title" do
    sign_in_as @user
    get maps_path, headers: inertia_headers
    assert_equal({ "unseen" => 1, "latest" => { "id" => @new.id, "title" => "Nouvelle" } }, props["releaseNotes"])
    get release_notes_path, headers: inertia_headers
    get maps_path, headers: inertia_headers
    assert_equal({ "unseen" => 0, "latest" => nil }, props["releaseNotes"])
  end

  test "thumbs up and take it back, once per person" do
    sign_in_as @user
    post release_note_like_path(@new), as: :json
    assert_response :created
    assert response.parsed_body["liked"]
    assert_equal 1, response.parsed_body["likesCount"]
    post release_note_like_path(@new), as: :json
    assert_equal 1, @new.likes.count
    delete release_note_like_path(@new), as: :json
    assert_response :ok
    assert_not response.parsed_body["liked"]
    assert_equal 0, @new.likes.count
  end

  test "no thumbs up on a draft" do
    sign_in_as @user
    post release_note_like_path(@draft), as: :json
    assert_response :not_found
  end

  test "screenshot: a short-lived link for published entries, drafts for staff only" do
    [ @new, @draft ].each do |note|
      note.screenshot.attach(io: file_fixture_or_png, filename: "s.png", content_type: "image/png")
    end
    sign_in_as @user
    get screenshot_release_note_path(@new)
    assert_response :redirect
    get screenshot_release_note_path(@draft)
    assert_response :not_found
    sign_in_as User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    get screenshot_release_note_path(@draft)
    assert_response :redirect
  end

  private
    def file_fixture_or_png
      StringIO.new(Base64.decode64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="))
    end
end

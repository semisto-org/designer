require "test_helper"

# « Charte graphique »: the colours, fonts, cover and footer of the documents
# of a pro account (/account/charte) or a team (/teams/:id/charte).
class DocumentThemesControllerTest < ActionDispatch::IntegrationTest
  setup { @user = users(:michael) }

  test "a pro sets their charter; a field equal to Semisto's follows Semisto's" do
    sign_in_as @user
    get account_document_theme_path, headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal "document_themes/show", response.parsed_body["component"]
    assert_equal DocumentTheme::DEFAULTS["heading_color"], props["theme"]["headingColor"]
    assert props["canEdit"]
    assert_equal DocumentTheme::FONTS.size, props["fonts"].size

    patch account_document_theme_path, params: { theme: {
      heading_color: "#5B5781", accent_color: DocumentTheme::DEFAULTS["accent_color"], heading_font: "fraunces",
      body_font: "nope", footer: "Semisto ASBL · Yvoir", cover: fixture_file_upload("plant.png", "image/png")
    } }
    assert_redirected_to account_document_theme_path
    @user.reload
    assert_equal({ "heading_color" => "#5b5781", "heading_font" => "fraunces", "footer" => "Semisto ASBL · Yvoir" }, @user.document_theme)
    assert @user.document_cover.attached?
    get @user.document_cover_url
    assert_response :redirect, "the cover opens without a session, like the logo"

    patch account_document_theme_path, params: { theme: { remove_cover: "true" } }
    assert_not @user.reload.document_cover.attached?
    assert_equal({}, @user.document_theme)
  end

  test "the AI's proposal waits on the page until it is taken or refused" do
    @user.update!(document_theme_draft: { "theme" => { "accent_color" => "#afbd00" }, "rationale" => "Design System Semisto", "client_name" => "Claude" })
    sign_in_as @user
    get account_document_theme_path, headers: inertia_headers
    draft = response.parsed_body["props"]["draft"]
    assert_equal [ "#afbd00", "Claude" ], [ draft["theme"]["accentColor"], draft["clientName"] ]
    assert_equal DocumentTheme::DEFAULTS["accent_color"], response.parsed_body["props"]["theme"]["accentColor"], "not applied before it is taken"

    post accept_draft_account_document_theme_path
    assert_equal({ "accent_color" => "#afbd00" }, @user.reload.document_theme)
    assert_nil @user.document_theme_draft

    @user.update!(document_theme_draft: { "theme" => { "accent_color" => "#000000" } })
    delete reject_draft_account_document_theme_path
    assert_nil @user.reload.document_theme_draft
    assert_equal({ "accent_color" => "#afbd00" }, @user.document_theme)
  end

  test "every member sees the team's charter; only admins change it" do
    team = Organization.create_with_admin!(@user, name: "Semisto")
    team.memberships.create!(user: users(:alice), role: "member")
    sign_in_as users(:alice)
    get team_document_theme_path(team), headers: inertia_headers
    assert_response :success
    assert_not response.parsed_body["props"]["canEdit"]
    patch team_document_theme_path(team), params: { theme: { heading_color: "#111111" } }
    assert_equal({}, team.reload.document_theme)

    sign_in_as users(:bob)
    get team_document_theme_path(team)
    assert_response :not_found

    sign_in_as @user
    patch team_document_theme_path(team), params: { theme: { heading_color: "#111111" } }
    assert_equal({ "heading_color" => "#111111" }, team.reload.document_theme)
  end

  test "the offer and the map's documents wear the charter of the map's team, else its owner's" do
    map = maps(:ahinvaux)
    @user.update!(account_kind: "professional", document_theme: { "body_font" => "dm_sans", "footer" => "Yvoir" })
    sign_in_as @user
    get preview_map_offer_path(map), headers: inertia_headers
    assert_equal [ "DM Sans Variable", "Yvoir" ], response.parsed_body["props"]["theme"].values_at("bodyFamily", "footer")

    get preview_map_offer_path(map, format: :docx)
    assert_response :success
    Zip::InputStream.open(StringIO.new(response.body)) do |zip|
      entries = {}
      while (entry = zip.get_next_entry)
        entries[entry.name] = zip.read
      end
      assert_includes entries["word/styles.xml"], 'w:ascii="DM Sans"'
      assert_includes entries["word/footer1.xml"], "Yvoir"
      assert_includes entries["word/document.xml"], "footerReference"
    end
  end
end

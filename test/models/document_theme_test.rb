require "test_helper"

class DocumentThemeTest < ActiveSupport::TestCase
  setup { @user = users(:michael) }

  test "Semisto's charter fills whatever the holder leaves empty" do
    theme = DocumentTheme.new(@user)
    assert_equal DocumentTheme::DEFAULTS, theme.values
    assert_equal "EB Garamond Variable", theme.as_json[:headingFamily]

    @user.update!(document_theme: { "heading_color" => "#123456", "body_font" => "lora" })
    json = DocumentTheme.new(@user).as_json
    assert_equal [ "#123456", DocumentTheme::DEFAULTS["accent_color"], "Lora Variable" ], json.values_at(:headingColor, :accentColor, :bodyFamily)
  end

  test "normalize keeps only valid colours, listed fonts and a plain footer" do
    clean = DocumentTheme.normalize("heading_color" => "#ABCDEF", "accent_color" => "red", "heading_font" => "Comic Sans",
      "body_font" => "work_sans", "footer" => " Semisto ASBL\r\nYvoir ", "other" => "x")
    assert_equal({ "heading_color" => "#abcdef", "body_font" => "work_sans", "footer" => "Semisto ASBL\nYvoir" }, clean)
    assert_equal DocumentTheme::MAX_FOOTER, DocumentTheme.normalize("footer" => "a" * 2000)["footer"].size
  end

  test "a map wears its team's charter, else its owner's" do
    map = maps(:ahinvaux)
    assert_equal map.owner, DocumentTheme.holder_for(map)
    team = Organization.create_with_admin!(@user, name: "Semisto")
    map.update!(organization: team)
    assert_equal team, DocumentTheme.holder_for(map)
  end

  test "taking the AI's proposal lays its fields over the charter" do
    @user.update!(document_theme: { "footer" => "Yvoir" }, document_theme_draft: { "theme" => { "heading_color" => "#5b5781" }, "rationale" => "Design System" })
    @user.accept_document_theme_draft!
    assert_equal({ "footer" => "Yvoir", "heading_color" => "#5b5781" }, @user.reload.document_theme)
    assert_nil @user.document_theme_draft
  end
end

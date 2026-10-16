require "test_helper"

class MapLetterheadTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @owner = @map.owner
  end

  def attach_logo(record)
    record.logo.attach(io: file_fixture("plant.png").open, filename: "logo.png", content_type: "image/png")
    record.save!
  end

  test "the team's logo first, else the pro owner's, else none" do
    assert_nil @map.letterhead

    attach_logo(@owner)
    @owner.update!(account_kind: "individual")
    assert_nil @map.reload.letterhead, "a private person's logo is not printed"

    @owner.update!(account_kind: "professional")
    assert_equal({ logoUrl: @owner.logo_url, name: @owner.display_name }, @map.reload.letterhead)

    team = Organization.create_with_admin!(@owner, name: "Semisto")
    @map.update!(organization: team)
    assert_equal @owner.logo_url, @map.reload.letterhead[:logoUrl], "a team without a logo leaves the owner's"

    attach_logo(team)
    assert_equal({ logoUrl: team.logo_url, name: "Semisto" }, @map.reload.letterhead)
  end

  test "a logo must be a small PNG, JPEG or WebP image" do
    team = Organization.create_with_admin!(@owner, name: "Semisto")
    team.logo.attach(io: file_fixture("notes.txt").open, filename: "logo.txt", content_type: "text/plain")
    assert_not team.valid?
    assert_includes team.errors[:logo], I18n.t("logos.errors.type")
  end
end

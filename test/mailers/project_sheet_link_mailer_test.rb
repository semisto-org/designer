require "test_helper"

class ProjectSheetLinkMailerTest < ActionMailer::TestCase
  test "tells the person the sheet was filled in, with a link to read it" do
    map = maps(:ahinvaux)
    map.update!(project: { "budget" => { "initial" => "under_500" } })
    link = map.create_project_sheet_link!(created_by: users(:michael))
    mail = ProjectSheetLinkMailer.submitted(link, users(:michael))
    assert_equal [ users(:michael).email_address ], mail.to
    assert_equal "Fiche projet remplie · #{map.name}", mail.subject
    assert_includes mail.text_part.body.to_s, "/maps/#{map.id}/project"
    assert_includes mail.html_part.body.to_s, "complétée à"
  end
end

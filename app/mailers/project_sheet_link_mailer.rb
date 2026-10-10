# Tells the people working on a map that the project sheet sent through its
# private link has been filled in.
class ProjectSheetLinkMailer < ApplicationMailer
  def submitted(link, user)
    @link = link
    @map = link.map
    @user = user
    @percent = @map.project_sheet.progress[:percent]
    @url = map_project_url(@map)
    mail to: user.email_address, subject: t(".subject", map: @map.name)
  end
end

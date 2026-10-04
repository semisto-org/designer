# « Mission drone »: tells the map owner that Semisto put the aerial view
# they ordered on their map, with a link to open it.
class DroneMailer < ApplicationMailer
  helper_method :french_date

  def view_ready(aerial_view)
    @view = aerial_view
    @map = aerial_view.map
    @user = @map.owner
    @map_url = map_url(@map)
    @help_url = help_article_url("la-vue-drone")
    mail to: @user.email_address, subject: t(".subject")
  end

  private
    def french_date(date) = Billing::FrenchDate.long(date)
end

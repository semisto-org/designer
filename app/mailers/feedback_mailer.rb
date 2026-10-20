# « Un retour ? » lands in Semisto's mailbox (Billing.contact_email) as soon
# as it is sent; replying goes to the person. All feedback stays readable in
# « Premières heures » (/admin/first-hours).
class FeedbackMailer < ApplicationMailer
  def received(feedback)
    @feedback = feedback
    @user = feedback.user
    @map = feedback.map
    @page_url = feedback.path.present? ? "#{root_url.chomp('/')}#{feedback.path}" : root_url
    @replay_url = feedback.sentry_replay_id && SessionReplay.url_for(feedback.sentry_replay_id)
    @admin_url = admin_first_hours_url
    mail to: Billing.contact_email,
      reply_to: email_address_with_name(@user.email_address, @user.display_name),
      subject: t(".subject", name: @user.display_name)
  end
end

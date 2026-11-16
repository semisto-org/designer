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
    # The annotated screenshot travels with the e-mail: what the person
    # circled is read at a glance, without opening the admin.
    if feedback.screenshot.attached?
      attachments["capture-#{feedback.id}.#{feedback.screenshot.filename.extension_without_delimiter.presence || 'jpg'}"] = feedback.screenshot.download
      @screenshot = true
    end
    mail to: Billing.contact_email,
      reply_to: email_address_with_name(@user.email_address, @user.display_name),
      subject: t(".subject", name: @user.display_name)
  end

  # Semisto answered: the new status and/or the reply, to the author, who
  # finds them all in « Mes retours » (/feedback). Replying reaches Semisto.
  def answered(feedback)
    @feedback = feedback
    @user = feedback.user
    @feedbacks_url = feedbacks_url
    mail to: email_address_with_name(@user.email_address, @user.display_name),
      reply_to: Billing.contact_email,
      subject: t(".subject.#{feedback.status}")
  end
end

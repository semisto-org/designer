class AccountMailer < ApplicationMailer
  # To Semisto: someone asks to delete their account (handled by hand).
  def deletion_request(user)
    @user = user
    mail to: Billing.contact_email, reply_to: user.email_address,
      subject: t(".subject", email: user.email_address)
  end

  # To the user: we received the request.
  def deletion_confirmation(user)
    @user = user
    mail to: user.email_address, subject: t(".subject")
  end
end

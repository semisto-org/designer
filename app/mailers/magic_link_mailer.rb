class MagicLinkMailer < ApplicationMailer
  def sign_in(user, return_to: nil)
    @user = user
    @url = magic_link_url(user.generate_token_for(:magic_link), return_to: return_to.presence)
    mail to: user.email_address, subject: t(".subject")
  end
end

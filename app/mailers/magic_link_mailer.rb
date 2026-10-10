class MagicLinkMailer < ApplicationMailer
  # The link signs in on the device that opens the e-mail; the code, typed
  # on the sign-in page, signs in on the device that asked for it.
  def sign_in(user, code: nil, return_to: nil)
    @user = user
    @code = code
    @url = magic_link_url(user.generate_token_for(:magic_link), return_to: return_to.presence)
    mail to: user.email_address, subject: code ? t(".subject_with_code", code:) : t(".subject")
  end
end

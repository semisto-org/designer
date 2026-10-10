class MagicLinkMailer < ApplicationMailer
  # The link signs in on the device that opens the e-mail; the code, typed
  # on the sign-in page, signs in on the device that asked for it.
  def sign_in(user, code: nil, sent_at: nil, return_to: nil)
    @user = user
    @code = code
    # The code is a seedling: sown now, to plant out within 20 minutes.
    @sown_at = (sent_at || Time.current).in_time_zone
    @wilts_at = @sown_at + User::SIGN_IN_TTL
    @url = magic_link_url(user.generate_token_for(:magic_link), return_to: return_to.presence)
    mail to: user.email_address, subject: code ? t(".subject_with_code", code:) : t(".subject")
  end
end

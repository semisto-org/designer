# Access for the app stores' reviewers (Apple asks for a demo account; they
# cannot open a magic link). Off unless both APP_REVIEW_EMAIL and
# APP_REVIEW_CODE are set, the code being long enough to resist guessing.
# It signs in that one account only; `bin/rails app_review:prepare` gives it
# a demo map.
module AppReview
  MIN_CODE_LENGTH = 16

  module_function

  def email = ENV["APP_REVIEW_EMAIL"].to_s.strip.downcase.presence
  def code = ENV["APP_REVIEW_CODE"].to_s.strip.presence

  def enabled?
    email.present? && code.to_s.length >= MIN_CODE_LENGTH
  end

  def match?(given_email, given_code)
    return false unless enabled?
    ActiveSupport::SecurityUtils.secure_compare(given_email.to_s.strip.downcase, email) &
      ActiveSupport::SecurityUtils.secure_compare(given_code.to_s.strip, code)
  end

  def user
    User.find_or_create_by!(email_address: email) { |user| user.name = "Relecture des stores" }
  end
end

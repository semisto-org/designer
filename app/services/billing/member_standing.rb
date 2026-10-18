module Billing
  # Whether a user gets the member price on Home: their sign-in address is
  # that of a Semisto ASBL member in good standing, according to Semisto's
  # internal app. A missing configuration or an unreachable app means no
  # discount (the payment page still works); the answer is cached briefly so
  # the billing page and the checkout agree without asking twice.
  module MemberStanding
    CACHE_TTL = 10.minutes

    module_function

    def in_good_standing?(user)
      return false unless user&.email_address.present?
      provider = Providers::SemistoMembership.new
      return false unless provider.configured?
      Rails.cache.fetch([ "member_standing", Digest::SHA256.hexdigest(user.email_address.downcase) ], expires_in: CACHE_TTL) do
        provider.standing(user.email_address).in_good_standing
      end
    rescue Providers::SemistoMembership::Unavailable => e
      Rails.error.report(e, handled: true, severity: :warning)
      false
    end
  end
end

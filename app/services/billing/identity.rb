module Billing
  # Finds the user a Stripe object belongs to: our own user_id metadata first
  # (set when the session is created), then the Stripe customer id.
  module Identity
    module_function

    def user_for(object, user_id: nil, customer_id: nil)
      user_id ||= object.dig("metadata", "user_id").presence || object["client_reference_id"].presence
      customer_id ||= Payload.id_of(object["customer"])
      (user_id && User.find_by(id: user_id)) ||
        (customer_id && BillingAccount.find_by(stripe_customer_id: customer_id)&.user)
    end

    # Remembers the Stripe customer of a user (the first one wins).
    def link_customer(user, customer_id)
      return if customer_id.blank?
      return if user.billing_account
      BillingAccount.create_or_find_by!(stripe_customer_id: customer_id) { |account| account.user = user }
    end
  end
end

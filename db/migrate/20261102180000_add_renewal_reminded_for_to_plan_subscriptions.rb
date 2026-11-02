# The renewal date a yearly subscription's reminder was last sent for, so the
# daily job writes once per renewal (Billing::SubscriptionRenewalReminders).
class AddRenewalRemindedForToPlanSubscriptions < ActiveRecord::Migration[8.1]
  def change
    add_column :plan_subscriptions, :renewal_reminded_for, :datetime
  end
end

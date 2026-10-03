# Billing: one Stripe customer per user, one-off purchases (yearly pass,
# drone mission) and recurring subscriptions (Atelier, Bureau d'études).
class CreateBillingAccountsAndPlans < ActiveRecord::Migration[8.1]
  def change
    create_table :billing_accounts do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :stripe_customer_id, null: false
      t.timestamps
    end
    add_index :billing_accounts, :stripe_customer_id, unique: true

    # A one-off purchase: the yearly pass (valid for a year, no renewal) or a
    # drone mission (a manual service, expires_at stays null).
    create_table :plan_purchases do |t|
      t.references :user, null: false, foreign_key: true
      t.string :plan_key, null: false
      t.string :status, null: false, default: "paid"
      t.datetime :starts_at, null: false
      t.datetime :expires_at
      t.string :stripe_checkout_session_id, null: false
      t.string :stripe_payment_intent_id
      t.timestamps
    end
    add_index :plan_purchases, :stripe_checkout_session_id, unique: true
    add_index :plan_purchases, :stripe_payment_intent_id
    add_index :plan_purchases, %i[user_id plan_key status expires_at], name: "index_plan_purchases_on_user_plan_status_expiry"

    # A Stripe subscription mirror (status follows the webhooks).
    create_table :plan_subscriptions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :plan_key, null: false
      t.string :status, null: false
      t.string :stripe_subscription_id, null: false
      t.string :stripe_customer_id
      t.string :stripe_price_id
      t.datetime :current_period_start
      t.datetime :current_period_end
      t.boolean :cancel_at_period_end, null: false, default: false
      t.datetime :canceled_at
      t.datetime :ended_at
      t.datetime :past_due_since
      t.datetime :synced_at
      t.timestamps
    end
    add_index :plan_subscriptions, :stripe_subscription_id, unique: true
  end
end

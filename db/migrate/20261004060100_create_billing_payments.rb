# The revenue ledger: one row per payment Stripe collected (checkout payment
# or subscription invoice), with amount, tax, currency, plan and promotion
# code. Semisto's revenue share is computed from this table.
class CreateBillingPayments < ActiveRecord::Migration[8.1]
  def change
    create_table :billing_payments do |t|
      t.references :user, null: false, foreign_key: true
      t.references :plan_purchase, foreign_key: true
      t.references :plan_subscription, foreign_key: true
      t.string :plan_key, null: false
      t.integer :amount_cents, null: false            # collected, tax included
      t.integer :tax_cents, null: false, default: 0   # of which VAT
      t.integer :discount_cents, null: false, default: 0
      t.string :currency, null: false, default: "eur"
      t.string :promotion_code
      t.datetime :paid_at, null: false
      t.integer :refunded_cents, null: false, default: 0
      t.datetime :refunded_at
      t.boolean :livemode, null: false, default: true
      t.string :stripe_checkout_session_id
      t.string :stripe_invoice_id
      t.string :stripe_payment_intent_id
      t.string :stripe_charge_id
      t.string :stripe_customer_id
      t.text :hosted_invoice_url
      t.text :invoice_pdf_url
      t.timestamps
    end
    add_index :billing_payments, :stripe_checkout_session_id, unique: true
    add_index :billing_payments, :stripe_invoice_id, unique: true
    add_index :billing_payments, :stripe_payment_intent_id
    add_index :billing_payments, :paid_at
    add_index :billing_payments, :promotion_code
  end
end

class CreateStripeEventsAndBillingNotices < ActiveRecord::Migration[8.1]
  def change
    # Every webhook event we received, stored once (idempotency) with the
    # outcome of its processing.
    create_table :stripe_events do |t|
      t.string :stripe_event_id, null: false
      t.string :event_type, null: false
      t.boolean :livemode, null: false, default: true
      t.jsonb :payload, null: false, default: {}
      t.datetime :processed_at
      t.integer :attempts, null: false, default: 0
      t.text :error
      t.string :note
      t.timestamps
    end
    add_index :stripe_events, :stripe_event_id, unique: true
    add_index :stripe_events, :event_type
    add_index :stripe_events, :created_at

    # Renewal e-mails already sent for a yearly pass (30 days, 7 days, expired).
    create_table :billing_notices do |t|
      t.references :plan_purchase, null: false, foreign_key: true
      t.string :kind, null: false
      t.datetime :sent_at, null: false
      t.timestamps
    end
    add_index :billing_notices, %i[plan_purchase_id kind], unique: true
  end
end

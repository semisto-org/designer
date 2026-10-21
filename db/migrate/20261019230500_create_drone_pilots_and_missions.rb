# The drone pilot directory (« Pilotes de drone »): pilots apply, Semisto
# approves them, and a gardener books one for a mission on a map, paid in
# Terranova and paid out to the pilot through Stripe Connect.
class CreateDronePilotsAndMissions < ActiveRecord::Migration[8.1]
  def change
    create_table :drone_pilots do |t|
      t.references :user, null: false, foreign_key: { on_delete: :cascade }, index: { unique: true }
      t.string :status, null: false, default: "pending"
      t.string :display_name, null: false
      t.text :bio
      t.string :base_place, null: false
      t.st_point :base_location, srid: 4326, null: false
      t.integer :service_radius_km, null: false, default: 50
      t.integer :mission_price_cents, null: false
      t.boolean :travel_fees_enabled, null: false, default: false
      t.jsonb :drones, null: false, default: []
      t.jsonb :data_types, null: false, default: []
      t.jsonb :certificates, null: false, default: []
      t.string :operator_number, null: false
      t.string :insurer, null: false
      t.string :phone
      # Who gets paid, and what the yearly DAC7 report needs.
      t.string :legal_form, null: false
      t.string :legal_name, null: false
      t.string :business_number
      t.string :vat_number
      t.string :tax_number
      t.text :address, null: false
      t.string :country, null: false, default: "BE"
      t.date :birth_date
      t.string :stripe_account_id, index: { unique: true }
      t.boolean :payouts_enabled, null: false, default: false
      t.boolean :details_submitted, null: false, default: false
      t.references :reviewed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :reviewed_at
      t.text :review_note
      t.timestamps
    end
    add_index :drone_pilots, :status
    add_index :drone_pilots, :base_location, using: :gist

    create_table :drone_missions do |t|
      t.references :map, null: false, foreign_key: { on_delete: :restrict }
      t.references :client, null: false, foreign_key: { to_table: :users, on_delete: :restrict }
      t.references :drone_pilot, null: false, foreign_key: { on_delete: :restrict }
      t.string :status, null: false, default: "requested"
      t.jsonb :data_types, null: false, default: []
      t.string :desired_period
      t.text :message, null: false
      t.text :pilot_reply
      t.date :flight_on
      # Frozen when the mission is requested: what the client pays and who keeps what.
      t.integer :price_cents, null: false
      t.integer :travel_km, null: false, default: 0
      t.integer :travel_cents, null: false, default: 0
      t.integer :commission_cents, null: false
      t.string :currency, null: false, default: "eur"
      t.string :stripe_checkout_session_id, index: { unique: true }
      t.string :stripe_payment_intent_id
      t.string :stripe_charge_id
      t.boolean :livemode
      t.string :stripe_transfer_id, index: { unique: true }
      t.string :payout_error
      t.text :delivery_note
      t.text :dispute_message
      t.datetime :accepted_at
      t.datetime :paid_at
      t.datetime :delivered_at
      t.datetime :disputed_at
      t.datetime :paid_out_at
      t.datetime :closed_at
      t.timestamps
    end
    add_index :drone_missions, :status

    add_reference :aerial_views, :drone_mission, foreign_key: { on_delete: :nullify }
    add_reference :map_photos, :drone_mission, foreign_key: { on_delete: :nullify }
  end
end

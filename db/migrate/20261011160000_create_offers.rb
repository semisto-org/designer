class CreateOffers < ActiveRecord::Migration[8.1]
  def change
    # The working offer of a team map: what the team is pricing now.
    create_table :offers do |t|
      t.references :map, null: false, foreign_key: true, index: { unique: true }
      # The team's choices and adjustments, a document typed by Offer::Inputs.
      t.jsonb :inputs, null: false, default: {}
      t.integer :lock_version, null: false, default: 0
      t.references :updated_by, foreign_key: { to_table: :users }
      t.timestamps
    end

    # A saved version of the offer (V1, V2…): inputs, the map's measures and
    # the computed budget, frozen when saved.
    create_table :offer_versions do |t|
      t.references :offer, null: false, foreign_key: true
      t.integer :number, null: false
      t.string :status, null: false, default: "saved"
      t.string :note
      t.jsonb :inputs, null: false, default: {}
      t.jsonb :measures, null: false, default: {}
      t.jsonb :result, null: false, default: {}
      t.references :created_by, foreign_key: { to_table: :users }
      t.timestamps
      t.index %i[offer_id number], unique: true
    end
  end
end

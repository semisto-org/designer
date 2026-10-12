class CreateOffers < ActiveRecord::Migration[8.1]
  def change
    # A way of pricing offers (Offer::Pricing), owned by a professional or a
    # team; several per account (« Particulier », « Commune »…).
    create_table :offer_templates do |t|
      t.references :owner, polymorphic: true, null: false
      t.string :name, null: false
      # Project-sheet profiles this template is the default for.
      t.string :client_types, array: true, null: false, default: []
      t.jsonb :data, null: false, default: {}
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    # The working offer of a team map: what the team is pricing now.
    create_table :offers do |t|
      t.references :map, null: false, foreign_key: true, index: { unique: true }
      # Its pricing; none: Semisto's.
      t.references :offer_template, foreign_key: { on_delete: :nullify }
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
      # The pricing as it was, and its name.
      t.jsonb :pricing, null: false, default: {}
      t.string :pricing_name
      t.references :created_by, foreign_key: { to_table: :users }
      t.timestamps
      t.index %i[offer_id number], unique: true
    end
  end
end

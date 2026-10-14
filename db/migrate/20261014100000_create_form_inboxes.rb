# Answers to a team's own forms (Tally), received by webhook and filed in
# the matching map's documents (FormInbox, ExternalForm, FormResponse).
class CreateFormInboxes < ActiveRecord::Migration[8.1]
  def change
    create_table :form_inboxes do |t|
      t.references :organization, null: false, foreign_key: true, index: { unique: true }
      t.string :token, null: false, index: { unique: true }
      t.string :signing_secret, null: false
      t.timestamps
    end

    create_table :external_forms do |t|
      t.references :form_inbox, null: false, foreign_key: true
      t.string :provider, null: false, default: "tally"
      t.string :external_id, null: false
      t.string :name, null: false
      t.timestamps
      t.index %i[form_inbox_id external_id], unique: true
    end

    create_table :form_responses do |t|
      t.references :external_form, null: false, foreign_key: true
      t.references :map, foreign_key: { on_delete: :nullify }
      t.references :map_document, foreign_key: { on_delete: :nullify }
      t.string :external_id, null: false
      t.string :map_reference
      t.jsonb :fields, null: false, default: []
      t.datetime :submitted_at, null: false
      t.timestamps
      t.index %i[external_form_id external_id], unique: true
    end
  end
end

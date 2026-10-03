# Requests sent from a map to Semisto (quality plants, implementation on
# quote, co-management). The user consents explicitly to Semisto looking at
# the map for this request; Semisto staff (admins) triage them.
class CreateServiceRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :service_requests do |t|
      t.references :map, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :kind, null: false
      t.string :status, null: false, default: "new"
      t.jsonb :payload, null: false, default: {}
      # What the map looked like when the request was sent (name, area,
      # address, plant count…), so staff can triage without opening it.
      t.jsonb :snapshot, null: false, default: {}
      t.boolean :contact_consent, null: false, default: false
      t.datetime :consented_at
      t.references :handled_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.text :admin_notes
      t.datetime :contacted_at
      t.datetime :closed_at
      t.timestamps
    end
    add_index :service_requests, %i[status created_at]
    add_index :service_requests, :kind
  end
end

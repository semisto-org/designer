class CreateRequestForms < ActiveRecord::Migration[8.1]
  def change
    # A pro account's public request form (« Demande de projet »): one per
    # account (a user with a professional plan, or a team).
    create_table :request_forms do |t|
      t.references :owner, polymorphic: true, null: false, index: { unique: true }
      t.string :slug, null: false, index: { unique: true }
      t.boolean :active, null: false, default: true
      t.text :intro
      t.timestamps
    end

    # What a prospect sent through it (who, where, what), and how far the
    # team has taken it. The place stays here until the team makes a map of
    # it, so a request never takes a map from anyone's plan by itself.
    create_table :project_requests do |t|
      t.references :request_form, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, foreign_key: { on_delete: :nullify }
      t.references :region, foreign_key: true
      t.string :name, null: false
      t.string :email, null: false
      t.string :phone
      t.string :address
      t.jsonb :parcels, null: false, default: []
      t.multi_polygon :boundary, srid: 4326
      t.st_point :center, srid: 4326
      t.float :area_m2
      t.string :status, null: false, default: "new"
      t.jsonb :answers, null: false, default: {}
      t.text :message
      t.text :team_notes
      t.datetime :status_changed_at
      t.timestamps
    end
    add_index :project_requests, [ :request_form_id, :status ]
  end
end

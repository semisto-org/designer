class CreateBillitDocuments < ActiveRecord::Migration[8.1]
  def change
    create_table :billit_documents do |t|
      t.references :billing_payment, null: false, foreign_key: true
      t.string :kind, null: false
      t.string :status, null: false, default: "pending"
      t.string :idempotency_key, null: false
      t.integer :amount_cents, null: false
      t.integer :tax_cents, null: false, default: 0
      t.bigint :billit_order_id
      t.string :order_number
      t.string :transport
      t.string :customer_vat_number
      t.text :last_error
      t.integer :attempts, null: false, default: 0
      t.datetime :sent_at
      t.datetime :delivered_at
      t.timestamps
    end
    add_index :billit_documents, :idempotency_key, unique: true
    add_index :billit_documents, :status
  end
end

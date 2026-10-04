# "Payer sur facture": a commune, a school or a company asks for an invoice
# (often with its purchase-order number) instead of paying by card. Staff
# send the invoice (through Stripe when billing is on, by hand otherwise)
# and can start the plan before the payment arrives (plan_grants).
class CreateInvoiceRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :invoice_requests do |t|
      t.references :user, null: false, foreign_key: true
      t.string :organization_name, null: false
      t.text :billing_address, null: false
      t.string :company_number
      t.string :billing_email, null: false
      t.string :purchase_order
      t.string :plan_key, null: false
      t.integer :duration_months, null: false, default: 12
      # Frozen when the request is sent: a later price change does not alter it.
      t.integer :amount_cents, null: false
      t.string :currency, null: false, default: "eur"
      t.text :message
      t.string :status, null: false, default: "requested"
      t.string :stripe_invoice_id
      t.string :stripe_invoice_number
      t.text :hosted_invoice_url
      t.text :invoice_pdf_url
      t.datetime :invoiced_at
      t.datetime :paid_at
      t.datetime :cancelled_at
      t.references :handled_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.timestamps
    end
    add_index :invoice_requests, :stripe_invoice_id, unique: true
    add_index :invoice_requests, %i[status created_at]
  end
end

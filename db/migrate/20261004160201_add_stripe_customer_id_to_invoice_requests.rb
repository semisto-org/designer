class AddStripeCustomerIdToInvoiceRequests < ActiveRecord::Migration[8.1]
  def change
    add_column :invoice_requests, :stripe_customer_id, :string
    add_index :invoice_requests, :stripe_customer_id
  end
end

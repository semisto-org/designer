# The payment of an invoice request lands in the ledger like any other, and
# renewal reminders are also sent for plans granted on invoice.
class LinkBillingRecordsToInvoicing < ActiveRecord::Migration[8.1]
  def change
    add_reference :billing_payments, :invoice_request, foreign_key: true

    change_column_null :billing_notices, :plan_purchase_id, true
    add_reference :billing_notices, :plan_grant, foreign_key: true
    add_index :billing_notices, %i[plan_grant_id kind], unique: true
  end
end

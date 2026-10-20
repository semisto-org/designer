# Semisto's commission is 20 % of the pilot's price before VAT, with Belgian
# VAT added on top for a Belgian pilot (Michael, 2026-10-20).
class AddVatToDroneCommission < ActiveRecord::Migration[8.1]
  def change
    # Whether the pilot's flat price includes VAT (false: VAT exemption, such
    # as the Belgian small-business scheme).
    add_column :drone_pilots, :charges_vat, :boolean, null: false, default: false
    add_column :drone_missions, :commission_vat_cents, :integer, null: false, default: 0
  end
end

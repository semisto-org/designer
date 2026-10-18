class AddVatNumberToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :vat_number, :string
  end
end

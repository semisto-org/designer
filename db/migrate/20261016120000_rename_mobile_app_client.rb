# The product is now Semisto Terranova: the phone app's OAuth client, created
# on first use with the old name, shows the new one in « Mon compte ».
class RenameMobileAppClient < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      UPDATE oauth_clients SET name = 'Semisto Terranova'
      WHERE client_id = 'semisto-designer-mobile' AND name = 'Semisto Designer'
    SQL
  end

  def down
    execute <<~SQL
      UPDATE oauth_clients SET name = 'Semisto Designer'
      WHERE client_id = 'semisto-designer-mobile' AND name = 'Semisto Terranova'
    SQL
  end
end

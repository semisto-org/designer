# « Ta première heure »: when the place's first reading was shown on a map
# (the owner or an editor closed « Voici ton lieu »). Existing maps are past
# their first hour: they never get the page by themselves.
class AddFirstHourStartedAtToMaps < ActiveRecord::Migration[8.1]
  def up
    add_column :maps, :first_hour_started_at, :datetime
    execute "UPDATE maps SET first_hour_started_at = created_at"
  end

  def down
    remove_column :maps, :first_hour_started_at
  end
end

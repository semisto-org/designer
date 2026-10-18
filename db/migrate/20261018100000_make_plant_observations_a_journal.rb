# A plant's follow-up becomes its journal: each entry has a kind (follow-up,
# flowering, pruning, damage…), and the take (survival) is only required for
# a follow-up entry.
class MakePlantObservationsAJournal < ActiveRecord::Migration[8.1]
  def change
    add_column :plant_observations, :kind, :string, null: false, default: "follow_up"
    change_column_null :plant_observations, :survival, true
  end
end

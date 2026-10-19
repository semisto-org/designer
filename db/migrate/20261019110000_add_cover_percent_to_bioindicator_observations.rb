# How much of the ground a wild plant covers where it was noted (a quick
# survey's « 5–25 % »), next to the coarser abundance it sets.
class AddCoverPercentToBioindicatorObservations < ActiveRecord::Migration[8.1]
  def change
    add_column :bioindicator_observations, :cover_percent, :integer, limit: 2
  end
end

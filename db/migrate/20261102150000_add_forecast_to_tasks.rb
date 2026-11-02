# A season step the team pencils in before the offer is signed: drawn apart
# on the team board (« prévisionnel ») until someone confirms it.
class AddForecastToTasks < ActiveRecord::Migration[8.1]
  def change
    add_column :tasks, :forecast, :boolean, default: false, null: false
  end
end

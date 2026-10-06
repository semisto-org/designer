class AddAiTrialToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :ai_trial_started_at, :datetime
    add_column :users, :ai_trial_reminded_at, :datetime
  end
end

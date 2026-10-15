# A soil sample can carry several lab reports (a standard analysis, a heavy
# metals analysis…), lab values outside the typed fields (`other_results`),
# and the values the person's AI read in those reports, waiting for review
# (`results_draft`).
class SoilSamplesSeveralReports < ActiveRecord::Migration[8.1]
  def up
    add_column :soil_samples, :other_results, :jsonb, default: [], null: false
    add_column :soil_samples, :results_draft, :jsonb
    execute <<~SQL
      UPDATE active_storage_attachments SET name = 'lab_reports'
      WHERE record_type = 'SoilSample' AND name = 'lab_report'
    SQL
  end

  def down
    execute <<~SQL
      UPDATE active_storage_attachments SET name = 'lab_report'
      WHERE record_type = 'SoilSample' AND name = 'lab_reports'
    SQL
    remove_column :soil_samples, :results_draft
    remove_column :soil_samples, :other_results
  end
end

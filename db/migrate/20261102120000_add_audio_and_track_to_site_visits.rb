# A visit can keep what was said on the walk (an audio recording, filed in
# the map's documents) and where the walk went (the GPS track).
class AddAudioAndTrackToSiteVisits < ActiveRecord::Migration[8.1]
  def change
    add_reference :site_visits, :audio_document, foreign_key: { to_table: :map_documents, on_delete: :nullify }
    add_column :site_visits, :audio_seconds, :integer
    add_column :site_visits, :track, :line_string, srid: 4326
    add_column :site_visits, :track_m, :integer
  end
end

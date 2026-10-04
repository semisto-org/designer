# Accent-insensitive plant search (« amelanchier » finds « Amélanchier »).
class EnableUnaccent < ActiveRecord::Migration[8.1]
  def change
    enable_extension "unaccent"
  end
end

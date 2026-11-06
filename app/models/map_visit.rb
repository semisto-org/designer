# When a person last opened a map (MapsController#show), one row per person
# and map. « Mes cartes » resumes on the most recent one.
class MapVisit < ApplicationRecord
  belongs_to :user
  belongs_to :map

  # One query, whatever the row's state.
  def self.record(user, map, at: Time.current)
    upsert({ user_id: user.id, map_id: map.id, opened_at: at }, unique_by: %i[user_id map_id])
  end

  # { map_id => opened_at } for these maps.
  def self.opened_at_by_map(user, map_ids)
    where(user:, map_id: map_ids).pluck(:map_id, :opened_at).to_h
  end
end

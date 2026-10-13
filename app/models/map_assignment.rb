# A person of the team who works on a team map (« l'équipe du projet »),
# shown as an avatar on the team board. Set from the board or the map's
# « Projet d'équipe » dialog (MapBoard#update_board!).
class MapAssignment < ApplicationRecord
  belongs_to :map
  belongs_to :user

  validates :user_id, uniqueness: { scope: :map_id }
end

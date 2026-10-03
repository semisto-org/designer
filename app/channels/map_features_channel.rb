# Live changes of a map's features (created, updated, deleted), streamed to
# the people who can open the map: editors apply them to their editor,
# viewers see the design move. Broadcast by MapFeature::Broadcasts.
class MapFeaturesChannel < ApplicationCable::Channel
  def subscribed
    map = Map.active.find_by(id: params[:map_id])
    if map&.viewable_by?(current_user)
      stream_for map
    else
      reject
    end
  end
end

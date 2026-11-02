# The map's live discussion (« Discussion de la carte »): tells the open tabs
# of its members that a message was posted, edited, applauded or deleted
# (`{ type: "upsert" | "delete", id: }`, sent by Comment#relay_live). Each tab
# then reads the message through the comments API, with its own rights, so
# nothing personal travels on the stream.
class MapChatChannel < ApplicationCable::Channel
  def subscribed
    map = Map.find_by(id: params[:map_id])
    if map&.chat_member?(current_user)
      stream_for map
    else
      reject
    end
  end
end

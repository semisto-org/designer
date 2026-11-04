# The bell in the header: unread discussion messages across all my maps
# (Collab::ChatInbox), and « Tout marquer comme lu ».
class NotificationsController < ApplicationController
  def index
    render json: Collab::ChatInbox.new(Current.user).as_json
  end

  def read_all
    inbox = Collab::ChatInbox.new(Current.user)
    inbox.mark_all_read!
    render json: inbox.as_json
  end
end

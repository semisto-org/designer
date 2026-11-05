# The person's own stream, for the bell in the header (« Notifications »):
# a discussion message that reaches them on one of their maps is announced
# as `{ type: "chat", mapId:, commentId:, mention: }`. The tab then reads
# what it needs through /notifications, with its rights; no content travels
# on the stream.
class NotificationsChannel < ApplicationCable::Channel
  def subscribed
    stream_for current_user
  end
end

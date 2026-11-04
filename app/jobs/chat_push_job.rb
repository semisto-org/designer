# Sends a discussion message to the phones of the people it reaches
# (Collab::ChatAlert decides who).
class ChatPushJob < ApplicationJob
  queue_as :default
  discard_on ActiveJob::DeserializationError

  def perform(comment, user_ids)
    Collab::ChatPush.new(comment, user_ids).deliver
  end
end

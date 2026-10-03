# Sends the e-mails for a new (or edited) comment, off the request.
class CommentNotificationJob < ApplicationJob
  queue_as :default
  discard_on ActiveJob::DeserializationError

  # `only_mentions`: user ids, after an edit that added mentions.
  def perform(comment, only_mentions: nil)
    return if comment.deleted?
    Collab::CommentNotifier.new(comment).deliver(only_mentions: only_mentions)
  end
end

module Collab
  # Decides who is e-mailed about a comment and queues the messages
  # (`deliver_later`): mentioned people get a "mention" mail, other
  # subscribers of the thread a "new comment" mail, never the author, never
  # someone who left the map, never someone who turned discussion e-mails off.
  class CommentNotifier
    def initialize(comment)
      @comment = comment
    end

    # `only_mentions: [ids]` is used after an edit: just the new mentions.
    def deliver(only_mentions: nil)
      mentioned = mentioned_recipients(only_mentions)
      mentioned.each { |user| CommentMailer.mentioned(@comment, user).deliver_later }
      return mentioned if only_mentions

      subscriber_recipients(excluding: mentioned.map(&:id)).each do |user|
        CommentMailer.new_comment(@comment, user).deliver_later
      end
      mentioned
    end

    private
      def audience
        @audience ||= @comment.map.participants.where(comment_emails: true).where.not(id: @comment.author_id).to_a
      end

      def mentioned_recipients(only_mentions)
        ids = only_mentions || @comment.mentioned_user_ids
        audience.select { |user| ids.include?(user.id) }
      end

      def subscriber_recipients(excluding:)
        subscribed = CommentSubscription.where(commentable: @comment.commentable).pluck(:user_id)
        audience.select { |user| subscribed.include?(user.id) && excluding.exclude?(user.id) }
      end
  end
end

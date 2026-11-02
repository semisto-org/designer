module Collab
  # Decides who is e-mailed about a comment and queues the messages
  # (`deliver_later`): mentioned people get a "mention" mail, other
  # subscribers of the thread a "new comment" mail, never the author, never
  # someone who left the map, never someone who turned discussion e-mails off.
  #
  # The map's own discussion is live: a mention is still e-mailed at once,
  # the other messages wait for the digest (Collab::ChatDigest).
  class CommentNotifier
    def initialize(comment)
      @comment = comment
    end

    # Who a new comment from `author` on `commentable` would e-mail, mentions
    # aside: shown under the comment box (« Michael recevra un e-mail »).
    # Nil for the map's own discussion, e-mailed as a digest to its members.
    def self.recipients_for(commentable, author)
      return nil if commentable.is_a?(Map)
      map = commentable.comment_map
      ids = CommentSubscription.where(commentable:).pluck(:user_id)
      ids << map.owner_id if Comment.alerts_owner?(commentable, author)
      map.participants.where(id: ids, comment_emails: true).where.not(id: author.id).order(:id).to_a
    end

    # `only_mentions: [ids]` is used after an edit: just the new mentions.
    def deliver(only_mentions: nil)
      mentioned = mentioned_recipients(only_mentions)
      mentioned.each { |user| CommentMailer.mentioned(@comment, user).deliver_later }
      return mentioned if only_mentions

      if @comment.chat?
        ChatDigest.schedule(@comment.map)
        return mentioned
      end

      subscriber_recipients(excluding: mentioned.map(&:id)).each do |user|
        CommentMailer.new_comment(@comment, user).deliver_later
      end
      mentioned
    end

    private
      def audience
        @audience ||= @comment.mention_pool.where(comment_emails: true).where.not(id: @comment.author_id).to_a
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

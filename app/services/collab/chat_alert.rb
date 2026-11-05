module Collab
  # Where a new message of a map's discussion reaches each member, at once
  # (Michael, 2026-11-04): the bell in the app's header (NotificationsChannel)
  # and their phones (ChatPush). E-mail follows on its own rhythm
  # (CommentNotifier for a mention, ChatDigest for the rest).
  #
  # Reached: the discussion's members but the author, by their level on this
  # map (CommentSubscription.chat_level: every message, only mentions, or
  # nothing), each channel by their switch in « Mon compte »
  # (`chat_notify_app`, `chat_notify_push`).
  class ChatAlert
    def initialize(comment)
      @comment = comment
      @map = comment.map
    end

    # Returns the users reached (whatever the channel).
    def deliver
      reached = recipients
      reached.each do |user|
        next unless user.chat_notify_app
        NotificationsChannel.broadcast_to(user, { type: "chat", mapId: @map.id, commentId: @comment.id, mention: mentioned?(user) })
      end
      push_ids = reached.select(&:chat_notify_push).map(&:id).sort
      ChatPushJob.perform_later(@comment, push_ids) if push_ids.any? && PushDevice.where(user_id: push_ids).exists?
      reached
    end

    def recipients
      members = @map.chat_participants.where.not(id: @comment.author_id).to_a
      levels = CommentSubscription.chat_levels(members, @map)
      members.select do |user|
        case levels[user.id]
        when "all" then true
        when "mentions" then mentioned?(user)
        else false
        end
      end
    end

    private
      def mentioned?(user) = @comment.mentioned_user_ids.include?(user.id)
  end
end

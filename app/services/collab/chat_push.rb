module Collab
  # One discussion message to the phones of `user_ids`: the map's name as the
  # title, « Chris : … » as the body, and the map and message in `data` so a
  # tap opens the discussion on it. People who read it meanwhile, or whose
  # message was deleted, get nothing.
  class ChatPush
    BODY_MAX = 160

    def initialize(comment, user_ids, provider: Providers::ExpoPush.new)
      @comment = comment
      @user_ids = user_ids
      @provider = provider
    end

    def deliver
      return [] if @comment.deleted? || !@provider.configured?
      devices = PushDevice.where(user_id: still_unread).includes(:user).to_a
      return [] if devices.empty?

      gone = @provider.deliver(devices.map { |device| message(device) })
      PushDevice.where(token: gone).delete_all if gone.any?
      devices.map(&:user_id).uniq
    rescue Providers::ExpoPush::Unavailable => error
      Rails.logger.warn("[chat push] #{error.message}")
      []
    end

    private
      def still_unread
        read = CommentRead.where(commentable: @comment.map, user_id: @user_ids).where(last_read_at: @comment.created_at..).pluck(:user_id)
        User.where(id: @user_ids - read, chat_notify_push: true).select(:id)
      end

      def message(device)
        mention = @comment.mentioned_user_ids.include?(device.user_id)
        {
          to: device.token,
          title: @comment.map.name,
          body: I18n.t(mention ? "collab.chat.push.mention" : "collab.chat.push.message", author: @comment.author.display_name, body: @comment.body.squish.truncate(BODY_MAX)),
          sound: "default",
          channelId: "discussion",
          data: { type: "chat", mapId: @comment.map_id, commentId: @comment.id }
        }
      end
  end
end

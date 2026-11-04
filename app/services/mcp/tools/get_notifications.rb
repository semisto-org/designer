module Mcp
  module Tools
    # What waits for the person in the discussions of all their maps (the
    # bell in the header, Collab::ChatInbox), and where a message reaches
    # them (the bell, e-mail, the phone) and how much, map by map. Read only:
    # the settings change in « Mon compte » and in each discussion.
    class GetNotifications < Base
      arguments(properties: {})
      hints

      def perform
        inbox = Collab::ChatInbox.new(user)
        {
          unread: inbox.items.map do |item|
            {
              map_id: item.map.id, map_name: item.map.name, unread: item.unread, mentions: item.mentions,
              last_message: { author: item.last.author.display_name, body: item.last.body.squish.truncate(Collab::ChatInbox::EXCERPT), created_at: item.last.created_at.iso8601 },
              url: "#{map_url(item.map)}?discussion=#{item.map.comment_key}"
            }
          end,
          channels: { bell: user.chat_notify_app, email: user.comment_emails, phone: user.chat_notify_push, phones: user.push_devices.count },
          email_delay_minutes: (Collab::ChatDigest::DELAY / 60).to_i,
          settings_url: "#{origin}/account#notifications"
        }
      end

      private
        def summarize_result(data) = { maps: data[:unread].size }
    end
  end
end

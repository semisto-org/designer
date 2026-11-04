module Collab
  # The e-mail digest of the map's live discussion (decided with Michael,
  # 2026-11-02): a mention is e-mailed at once (CommentNotifier); the other
  # messages wait ten minutes (an hour until 2026-11-04: Chris's message
  # reached Michael an hour late), then each member who has not read them
  # meanwhile (the bell or the phone told them at once) gets one e-mail with
  # all of them. One digest job per map at a time
  # (`maps.chat_digest_at`); the messages that arrive while it waits ride
  # along. Nobody gets a message twice (`comment_reads.emailed_until`), nor
  # their own messages, nor the ones that mentioned them.
  #
  # On a team map whose project team is set, the rest of the team is out of
  # the digest unless they turn it on (Map#chat_audience).
  #
  # Out of the digest: people who turned discussion e-mails off
  # (`users.comment_emails`) or muted this map's discussion (a muted
  # CommentSubscription on the map).
  class ChatDigest
    DELAY = 10.minutes
    MAX_MESSAGES = 30

    def self.schedule(map, now: Time.current)
      due = now + DELAY
      # Only the first message of a quiet map books the job.
      booked = Map.where(id: map.id).where("chat_digest_at IS NULL OR chat_digest_at < ?", now).update_all(chat_digest_at: due)
      ChatDigestJob.set(wait_until: due).perform_later(map) if booked == 1
    end

    def initialize(map, now: Time.current)
      @map = map
      @now = now
    end

    # Sends the digests; returns the users e-mailed.
    def deliver
      @map.update_columns(chat_digest_at: nil)
      return [] if @map.archived?

      recipients.filter_map do |user|
        read = CommentRead.find_by(user:, commentable: @map)
        since = [ read&.last_read_at, read&.emailed_until ].compact.max
        messages = unread_for(user, since)
        next if messages.empty?
        CommentMailer.chat_digest(@map, user, messages.map(&:id)).deliver_later
        mark_emailed(user, read)
        user
      end
    end

    private
      # The discussion's audience (on a team map, its project team) and the
      # members who turned the digest on, minus those who muted it.
      def recipients
        subscriptions = CommentSubscription.where(commentable: @map)
        ids = @map.chat_audience.pluck(:id) | subscriptions.where(muted: false).pluck(:user_id)
        @map.chat_participants.where(id: ids, comment_emails: true)
          .where.not(id: subscriptions.where(muted: true).select(:user_id)).to_a
      end

      def unread_for(user, since)
        scope = @map.comments.visible.where(created_at: ..@now).where.not(author_id: user.id)
        scope = scope.where(created_at: since..) if since
        scope.chronological.reject { |c| c.mentioned_user_ids.include?(user.id) }.last(MAX_MESSAGES)
      end

      def mark_emailed(user, read)
        if read
          read.update_columns(emailed_until: @now)
        else
          # Never opened: nothing read yet, the digest still counts as sent.
          CommentRead.create!(user:, commentable: @map, last_read_at: Time.at(0), emailed_until: @now)
        end
      end
  end
end

module Collab
  # The bell in the header (« Notifications »): the maps whose discussion has
  # messages the person has not read, across all their maps, newest first
  # (Michael, 2026-11-04). Each map counts by the person's level on it
  # (CommentSubscription.chat_level): every message, only the ones naming
  # them, or nothing. Messages older than WINDOW are left out, so joining a
  # long-running map does not ring for its whole past.
  class ChatInbox
    WINDOW = 30.days
    EXCERPT = 140

    Item = Data.define(:map, :unread, :mentions, :last) do
      def as_json(*)
        {
          mapId: map.id, mapName: map.name, unread:, mentions:,
          lastAt: last.created_at.iso8601,
          last: { author: last.author.display_name, avatarUrl: last.author.avatar_url, body: last.body.squish.truncate(EXCERPT) },
          url: "/maps/#{map.id}?discussion=#{map.comment_key}"
        }
      end
    end

    def initialize(user, now: Time.current)
      @user = user
      @now = now
    end

    def items
      @items ||= build
    end

    # Messages counted on the bell (0 when the person turned it off).
    def total = @user.chat_notify_app ? items.sum(&:unread) : 0

    def as_json(*) = { items: items.map(&:as_json), total:, enabled: @user.chat_notify_app }

    # « Tout marquer comme lu ».
    def mark_all_read!
      items.each { |item| CommentRead.mark!(@user, item.map, at: @now) }
      @items = []
    end

    # The person's discussions: maps where they take part in the chat.
    def maps
      direct = MapMembership.where(user: @user, role: %w[owner editor]).or(MapMembership.where(user: @user, chat_access: true)).select(:map_id)
      Map.active.where(id: direct).or(Map.active.where(organization_id: @user.organization_memberships.select(:organization_id)))
    end

    private
      def build
        rows = unread_rows
        return [] if rows.empty?
        by_id = Map.where(id: rows.keys).index_by(&:id)
        lasts = Comment.visible.where(commentable_type: "Map", map_id: rows.keys).where.not(author_id: @user.id)
          .select("DISTINCT ON (map_id) comments.*").order(:map_id, created_at: :desc, id: :desc)
          .includes(:author).index_by(&:map_id)

        rows.filter_map do |map_id, (count, mentions)|
          map = by_id[map_id]
          next unless map && lasts[map_id]
          unread = case CommentSubscription.chat_level(@user, map)
                   when "all" then count
                   when "mentions" then mentions
                   else 0
                   end
          Item.new(map:, unread:, mentions:, last: lasts[map_id]) if unread.positive?
        end.sort_by { |item| -item.last.created_at.to_f }
      end

      # { map_id => [unread, unread naming the person] }
      def unread_rows
        join = Comment.sanitize_sql_array([ <<~SQL, @user.id ])
          LEFT JOIN comment_reads cr ON cr.user_id = ? AND cr.commentable_type = 'Map' AND cr.commentable_id = comments.map_id
        SQL
        mention = Comment.sanitize_sql_array([ "COUNT(*) FILTER (WHERE ? = ANY(comments.mentioned_user_ids))", @user.id ])
        Comment.visible.where(commentable_type: "Map", map_id: maps.select(:id)).where.not(author_id: @user.id)
          .where(created_at: (@now - WINDOW)..)
          .joins(join).where("cr.last_read_at IS NULL OR comments.created_at > cr.last_read_at")
          .group(:map_id).pluck(:map_id, Arel.sql("COUNT(*)"), Arel.sql(mention))
          .to_h { |map_id, count, mentions| [ map_id, [ count, mentions ] ] }
      end
  end
end

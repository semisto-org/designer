module Collab
  # The map's discussions at a glance: one row per thread that has comments
  # (plus the map's own thread, always), newest activity first.
  class ThreadList
    PREVIEW = 120

    def initialize(map, user)
      @map = map
      @user = user
    end

    def call
      comments = @map.discussion_comments.visible
      counts = comments.group(:commentable_type, :commentable_id).count
      latest = comments.select("DISTINCT ON (comments.commentable_type, comments.commentable_id) comments.*")
        .order(:commentable_type, :commentable_id, created_at: :desc, id: :desc).includes(:author)
        .index_by { |c| [ c.commentable_type, c.commentable_id ] }
      from_others = comments.where.not(author_id: @user.id).group(:commentable_type, :commentable_id).maximum(:created_at)
      reads = CommentRead.where(user: @user).index_by { |r| [ r.commentable_type, r.commentable_id ] }
      subscribed = CommentSubscription.where(user: @user).pluck(:commentable_type, :commentable_id).to_set

      keys = counts.keys | [ [ "Map", @map.id ] ]
      commentables = load_commentables(keys)
      rows = keys.filter_map do |key|
        record = commentables[key] or next
        last = latest[key]
        seen = reads[key]&.last_read_at
        newest_foreign = from_others[key]
        {
          type: key[0], id: key[1], key: record.comment_key, title: record.comment_title,
          layer: (record.layer if record.respond_to?(:layer)), kind: (record.kind if record.respond_to?(:kind)),
          count: counts[key] || 0,
          lastCommentAt: last&.created_at&.iso8601,
          lastAuthorName: last&.author&.display_name,
          preview: last && last.body.squish.truncate(PREVIEW),
          unread: newest_foreign.present? && (seen.nil? || newest_foreign > seen),
          subscribed: subscribed.include?(key)
        }
      end
      active, quiet = rows.partition { |row| row[:lastCommentAt] }
      active.sort_by { |row| row[:lastCommentAt] }.reverse + quiet
    end

    private
      def load_commentables(keys)
        keys.group_by(&:first).flat_map do |type, pairs|
          next [] unless Commentable::TYPES.include?(type)
          type.constantize.where(id: pairs.map(&:last)).select { |r| r.comment_map == @map }.map { |r| [ [ type, r.id ], r ] }
        end.to_h
      end
  end
end

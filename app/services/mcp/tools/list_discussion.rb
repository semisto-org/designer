module Mcp
  module Tools
    # The map's live discussion (« Discussion de la carte »), for its members:
    # what the team said while working, in the office or on the land, with
    # the elements each message cites, the spot it is pinned to and its
    # photo or document (read with get_document). Read only: the AI summarizes, finds what was decided, links a
    # remark to the map; it does not speak in the discussion.
    class ListDiscussion < Base
      MAX = 200

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          limit: { type: "integer", minimum: 1, maximum: MAX, default: 50, description: :limit },
          before_id: { type: "integer", minimum: 1, description: :discussion_before_id },
          since: { type: "string", format: "date", description: :discussion_since }
        },
        required: %w[map_id]
      )
      hints

      def perform(map_id:, limit: 50, before_id: nil, since: nil)
        map = find_map!(map_id)
        raise ToolError, t("errors.discussion_closed") unless map.chat_member?(user)

        scope = map.comments.visible.includes(:author, :map_photo, :map_document)
        scope = scope.where(comments: { id: ...before_id }) if before_id
        scope = scope.where(created_at: Date.iso8601(since).beginning_of_day..) if since
        page = scope.order(created_at: :desc, id: :desc).limit(limit.clamp(1, MAX)).to_a
        older = page.size == limit && scope.where(comments: { id: ...page.last.id }).exists?
        features = map.features.where(id: page.flat_map(&:feature_ids).uniq).index_by(&:id)
        read = CommentRead.find_by(user:, commentable: map)&.last_read_at

        {
          messages: page.reverse.map { |comment| message_json(comment, features, read) },
          members: map.chat_participants.order(:id).map(&:display_name),
          next_before_id: (page.last.id if older),
          url: "#{map_url(map)}?discussion=#{map.comment_key}"
        }
      rescue Date::Error
        raise ToolError, t("errors.discussion_date", value: since)
      end

      private
        def message_json(comment, features, read)
          {
            id: comment.id,
            author: comment.author.display_name,
            mine: comment.author_id == user.id,
            body: comment.body,
            created_at: comment.created_at.iso8601,
            edited: comment.edited?,
            unread: read.nil? || (comment.created_at > read && comment.author_id != user.id),
            features: comment.feature_ids.filter_map { |id| features[id] }.map do |f|
              { id: f.id, name: Collab::CommentSerializer.feature_label(f), layer: f.layer, kind: f.kind }
            end,
            location: comment.lnglat,
            photo_id: comment.map_photo_id,
            document: comment.map_document && { id: comment.map_document_id, title: comment.map_document.title, in_library: comment.map_document.in_library? }
          }.compact
        end

        def summarize_result(data) = { messages: data[:messages].size }
    end
  end
end

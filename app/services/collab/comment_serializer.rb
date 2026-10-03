module Collab
  # JSON for the comments API. Bodies stay plain text: the client renders
  # them as text and highlights the `mentions` handles it is given.
  class CommentSerializer
    def initialize(map, user)
      @map = map
      @user = user
    end

    def call(comment)
      applauses = comment.applauses.to_a
      {
        id: comment.id,
        body: comment.body,
        author: { id: comment.author_id, name: comment.author.display_name, avatarUrl: comment.author.avatar_url },
        createdAt: comment.created_at.iso8601,
        editedAt: comment.edited_at&.iso8601,
        mentions: comment.mentioned_user_ids.filter_map { |id| handles[id] && { id:, handle: handles[id] } },
        applause: {
          count: applauses.size,
          mine: applauses.any? { |a| a.user_id == @user.id },
          names: applauses.first(5).map { |a| a.user.display_name }
        },
        canEdit: comment.author_id == @user.id,
        canDelete: comment.author_id == @user.id || @map.manageable_by?(@user)
      }
    end

    # People who can be @mentioned: everyone with access but the current user.
    def mentionable
      participants.reject { |u| u.id == @user.id }.map do |u|
        { id: u.id, name: u.display_name, handle: handles[u.id], avatarUrl: u.avatar_url }
      end
    end

    private
      def participants = @participants ||= @map.participants.order(:id).to_a
      def handles = @handles ||= Collab::Mentions.handles(participants)
  end
end

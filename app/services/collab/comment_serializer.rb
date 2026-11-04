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
      names = comment.chat? ? chat_handles : handles
      {
        id: comment.id,
        body: comment.body,
        author: { id: comment.author_id, name: comment.author.display_name, avatarUrl: comment.author.avatar_url },
        createdAt: comment.created_at.iso8601,
        editedAt: comment.edited_at&.iso8601,
        mentions: comment.mentioned_user_ids.filter_map { |id| names[id] && { id:, handle: names[id] } },
        applause: {
          count: applauses.size,
          mine: applauses.any? { |a| a.user_id == @user.id },
          names: applauses.first(5).map { |a| a.user.display_name }
        },
        features: comment.cited_features.map { |f| { id: f.id, name: feature_label(f), layer: f.layer, kind: f.kind } },
        location: comment.lnglat,
        photo: comment.map_photo && { id: comment.map_photo.id, caption: comment.map_photo.caption, video: comment.map_photo.kind == "video" },
        document: comment.map_document && document_json(comment.map_document),
        canEdit: comment.author_id == @user.id,
        canDelete: comment.author_id == @user.id || @map.manageable_by?(@user)
      }
    end

    # People who can be @mentioned in a thread: everyone with access (the
    # discussion's members for the map's own thread) but the current user.
    def mentionable(commentable = nil)
      pool = commentable.is_a?(Map) ? chat_participants : participants
      names = commentable.is_a?(Map) ? chat_handles : handles
      pool.reject { |u| u.id == @user.id }.map do |u|
        { id: u.id, name: u.display_name, handle: names[u.id], avatarUrl: u.avatar_url }
      end
    end

    # How a cited element reads in a message: its name, or its kind and number.
    # Mirrors chatFeatureLabel() in the client, which types it after « # ».
    def self.feature_label(feature)
      number = feature.try(:plant_number)
      [ feature.comment_title, ("n° #{number}" if number) ].compact.join(" ")
    end

    def feature_label(feature) = self.class.feature_label(feature)

    private
      def document_json(document)
        blob = document.file.attached? ? document.file.blob : nil
        url = ->(size) { routes.file_map_document_path(@map, document, size:) }
        {
          id: document.id, title: document.title, filename: blob&.filename&.to_s, kind: document.kind,
          byteSize: blob&.byte_size, inLibrary: document.in_library?,
          previewUrl: document.preview ? url.call(document.preview == "image" ? "large" : "original") : nil,
          downloadUrl: url.call("download")
        }
      end

      def routes = Rails.application.routes.url_helpers

      def participants = @participants ||= @map.participants.order(:id).to_a
      def handles = @handles ||= Collab::Mentions.handles(participants)
      def chat_participants = @chat_participants ||= @map.chat_participants.order(:id).to_a
      def chat_handles = @chat_handles ||= Collab::Mentions.handles(chat_participants)
  end
end

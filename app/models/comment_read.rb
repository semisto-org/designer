# When a user last opened a thread; later comments by others show as unread.
class CommentRead < ApplicationRecord
  belongs_to :user
  belongs_to :commentable, polymorphic: true

  def self.mark!(user, commentable, at: Time.current)
    upsert({ user_id: user.id, commentable_type: commentable.class.polymorphic_name, commentable_id: commentable.id, last_read_at: at },
           unique_by: :index_comment_reads_unique, update_only: %i[last_read_at])
  end
end

# Someone following a thread: they get an e-mail on each new comment.
# Authors and mentioned people are subscribed automatically.
class CommentSubscription < ApplicationRecord
  belongs_to :user
  belongs_to :commentable, polymorphic: true
  validates :user_id, uniqueness: { scope: %i[commentable_type commentable_id] }

  def self.subscribe(user, commentable)
    find_or_create_by!(user:, commentable:)
  rescue ActiveRecord::RecordNotUnique
    find_by!(user:, commentable:)
  end

  def self.unsubscribe(user, commentable)
    where(user:, commentable:).destroy_all
  end

  # Drops a user's subscriptions inside a map (they left it).
  def self.purge(user, map)
    where(user:, commentable_type: "Map", commentable_id: map.id)
      .or(where(user:, commentable_type: "MapFeature", commentable_id: map.features.select(:id)))
      .destroy_all
  end

  def self.subscribed?(user, commentable)
    exists?(user:, commentable:)
  end
end

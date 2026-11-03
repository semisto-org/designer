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

  # The map's live discussion is e-mailed as a digest to its audience
  # (Map#chat_audience), who follow it unless they muted it; another member
  # (a team member outside the project team) follows it once they turned it
  # on (an unmuted subscription).
  def self.subscribed?(user, commentable)
    return chat_subscribed?(user, commentable) if commentable.is_a?(Map)
    exists?(user:, commentable:, muted: false)
  end

  def self.chat_subscribed?(user, map)
    return false unless map.chat_member?(user)
    muted = find_by(user:, commentable: map)&.muted
    muted.nil? ? map.chat_audience?(user) : !muted
  end

  # Mutes (or unmutes) the digest of a map's discussion for one person.
  def self.mute(user, map, muted)
    subscription = subscribe(user, map)
    subscription.update!(muted:)
    subscription
  end
end

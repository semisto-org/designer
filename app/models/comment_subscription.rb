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
    subscription.update!(muted:, silenced: muted && subscription.silenced)
    subscription
  end

  # How much of a map's discussion reaches one person, wherever it reaches
  # them (the bell, e-mail, the phone; Michael, 2026-11-04):
  # « all » every message, « mentions » only when someone names them,
  # « none » nothing at all. Without a choice of their own: every message for
  # the discussion's audience (Map#chat_audience), mentions for the rest of
  # the team.
  CHAT_LEVELS = %w[all mentions none].freeze

  def self.chat_level(user, map, subscription: :lookup, audience: nil)
    subscription = find_by(user:, commentable: map) if subscription == :lookup
    return "none" if subscription&.silenced
    return subscription.muted ? "mentions" : "all" if subscription
    (audience.nil? ? map.chat_audience?(user) : audience) ? "all" : "mentions"
  end

  # The level of each of `users` on `map`, in two queries.
  def self.chat_levels(users, map)
    subscriptions = where(commentable: map, user_id: users.map(&:id)).index_by(&:user_id)
    audience = map.chat_audience.where(id: users.map(&:id)).pluck(:id).to_set
    users.to_h { |user| [ user.id, chat_level(user, map, subscription: subscriptions[user.id], audience: audience.include?(user.id)) ] }
  end

  def self.set_chat_level(user, map, level)
    raise ArgumentError, "unknown level #{level.inspect}" unless CHAT_LEVELS.include?(level)
    subscription = subscribe(user, map)
    subscription.update!(muted: level != "all", silenced: level == "none")
    subscription
  end
end

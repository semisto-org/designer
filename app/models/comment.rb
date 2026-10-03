# One message of a discussion thread. Plain text; @mentions are resolved on
# the server against the people who can open the map. Deleting is soft.
class Comment < ApplicationRecord
  MAX_LENGTH = 5_000

  belongs_to :map
  belongs_to :commentable, polymorphic: true
  belongs_to :author, class_name: "User"
  has_many :applauses, dependent: :destroy

  # Keep line breaks, drop control characters and surrounding blank space.
  normalizes :body, with: ->(b) { b.to_s.gsub(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, "").gsub("\r\n", "\n").strip }

  before_validation :set_map, on: :create
  validates :body, presence: true, length: { maximum: MAX_LENGTH }
  validate :commentable_in_map
  before_save :resolve_mentions, if: -> { new_record? || will_save_change_to_body? }
  before_update :stamp_edit, if: :will_save_change_to_body?
  after_save :subscribe_participants
  after_create_commit :notify_later
  after_update_commit :notify_new_mentions, if: :saved_change_to_body?

  scope :visible, -> { where(deleted_at: nil) }
  scope :chronological, -> { order(:created_at, :id) }

  def deleted? = deleted_at.present?
  def edited? = edited_at.present?
  def soft_delete! = update!(deleted_at: Time.current)

  def mentioned_users
    map.participants.where(id: mentioned_user_ids)
  end

  # Mentions that appeared in the last edit (new mentions get notified).
  def newly_mentioned_ids
    change = saved_change_to_mentioned_user_ids
    change ? mentioned_user_ids - change.first : []
  end

  private
    def set_map
      self.map ||= commentable&.comment_map
    end

    def commentable_in_map
      return if commentable.nil? || map.nil?
      errors.add(:commentable, :invalid) unless commentable.comment_map == map
    end

    def resolve_mentions
      self.mentioned_user_ids = Collab::Mentions.parse(body, map.participants).map(&:id)
    end

    def stamp_edit
      self.edited_at = Time.current
    end

    # The author follows their own thread, and so do the people they mention.
    def subscribe_participants
      User.where(id: [ author_id ] + mentioned_user_ids).find_each do |user|
        CommentSubscription.subscribe(user, commentable)
      end
    end

    # E-mails go out through a job, once the comment is committed.
    def notify_later
      CommentNotificationJob.perform_later(self)
    end

    def notify_new_mentions
      ids = newly_mentioned_ids
      CommentNotificationJob.perform_later(self, only_mentions: ids) if ids.any?
    end
end

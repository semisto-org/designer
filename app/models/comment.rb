# One message of a discussion thread. Plain text; @mentions are resolved on
# the server against the people who can open the map. Deleting is soft.
#
# The comments on the map itself are its live discussion (« Discussion de la
# carte », `chat?`): only its members read them (Map#chat_member?), they are
# relayed live (MapChatChannel) and e-mailed as a digest (Collab::ChatDigest)
# rather than one by one. Any message can point at the map: elements cited
# with « # » (`feature_ids`), a pinned spot (`location`), a photo and a
# document of any kind (kept out of the library until someone adds it).
class Comment < ApplicationRecord
  include PointLocation

  MAX_LENGTH = 5_000
  MAX_FEATURES = 20

  belongs_to :map
  belongs_to :commentable, polymorphic: true
  belongs_to :author, class_name: "User"
  belongs_to :map_photo, optional: true
  belongs_to :map_document, optional: true
  has_many :applauses, dependent: :destroy

  # Keep line breaks, drop control characters and surrounding blank space.
  normalizes :body, with: ->(b) { b.to_s.gsub(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/, "").gsub("\r\n", "\n").strip }

  before_validation :set_map, on: :create
  validates :body, presence: true, length: { maximum: MAX_LENGTH }
  validate :commentable_in_map
  validate :photo_in_map
  validate :document_in_map
  before_save :keep_features_of_map, if: -> { new_record? || will_save_change_to_feature_ids? }
  before_save :resolve_mentions, if: -> { new_record? || will_save_change_to_body? }
  before_update :stamp_edit, if: :will_save_change_to_body?
  after_save :subscribe_participants
  after_create_commit :notify_later
  after_update_commit :notify_new_mentions, if: :saved_change_to_body?
  after_commit :relay_live, if: :chat?

  scope :visible, -> { where(deleted_at: nil) }
  scope :chronological, -> { order(:created_at, :id) }

  def deleted? = deleted_at.present?
  def chat? = commentable_type == "Map"
  def edited? = edited_at.present?
  # A document joined only to this message goes with it; one added to the
  # library stays there.
  def soft_delete!
    transaction do
      update!(deleted_at: Time.current)
      map_document.destroy! if map_document && !map_document.in_library?
    end
  end

  def mentioned_users
    mention_pool.where(id: mentioned_user_ids)
  end

  # The elements of the map this message cites, in the order of `feature_ids`.
  def cited_features
    return [] if feature_ids.empty?
    by_id = map.features.where(id: feature_ids).index_by(&:id)
    feature_ids.filter_map { |id| by_id[id] }
  end

  # Who a mention can reach: the discussion's members for the map's own
  # discussion, everyone with access for an element's thread.
  def mention_pool = chat? ? map.chat_participants : map.participants

  # A reader's (or a support role's) first message in an element's thread
  # reaches the map's owner, who follows the thread from then on: the first
  # question of a client must not wait for a designer to stumble on it.
  # `except` leaves out the comment being saved.
  def self.alerts_owner?(commentable, author, except: nil)
    map = commentable&.comment_map
    return false if map.nil? || commentable.is_a?(Map) || author.nil? || map.owner_id == author.id
    return false if map.editable_by?(author)
    commentable.comments.visible.where.not(id: except).none?
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

    def photo_in_map
      errors.add(:map_photo, :invalid) if map_photo && map && map_photo.map_id != map.id
    end

    def document_in_map
      errors.add(:map_document, :invalid) if map_document && map && map_document.map_id != map.id
    end

    # Cited elements: those of this map only, each once, at most MAX_FEATURES.
    def keep_features_of_map
      ids = Array(feature_ids).map(&:to_i).uniq.first(MAX_FEATURES)
      kept = ids.empty? || map.nil? ? [] : map.features.where(id: ids).pluck(:id)
      self.feature_ids = ids & kept
    end

    def resolve_mentions
      self.mentioned_user_ids = Collab::Mentions.parse(body, mention_pool).map(&:id)
    end

    # Tells the discussion's open tabs that this message changed (MapChatChannel).
    def relay_live
      MapChatChannel.broadcast_to(map, { type: destroyed? || deleted? ? "delete" : "upsert", id: })
    end

    def stamp_edit
      self.edited_at = Time.current
    end

    # The author follows their own thread, and so do the people they mention
    # (and the owner, for a reader's first question: Comment.alerts_owner?).
    # The map's discussion has no follow list: its members get the digest.
    def subscribe_participants
      return if chat?
      ids = [ author_id ] + mentioned_user_ids
      ids << map.owner_id if saved_change_to_id? && Comment.alerts_owner?(commentable, author, except: id)
      User.where(id: ids).find_each do |user|
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

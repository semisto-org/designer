# One entry of « Nouveautés »: something that changed in the Designer, told
# to the people who use it (a title, a few paragraphs, the day it shipped,
# an optional screenshot and an optional link to try it). Staff write them
# in /admin/release-notes; a draft (published_at nil) is visible to staff
# only. People give a thumbs up (ReleaseNoteLike) and see who else did.
class ReleaseNote < ApplicationRecord
  TITLE_MAX = 120
  BODY_MAX = 4_000
  MAX_BYTES = 15.megabytes
  CONTENT_TYPES = %w[image/jpeg image/png image/webp].freeze
  DISPLAY_SIZE = 1800
  # A link stays inside the Designer: a path, never another site.
  LINK_PATTERN = %r{\A/(?!/)[^\s]*\z}

  belongs_to :created_by, class_name: "User", optional: true
  has_many :likes, class_name: "ReleaseNoteLike", dependent: :delete_all

  has_one_attached :screenshot do |attachable|
    attachable.variant :display, resize_to_limit: [ DISPLAY_SIZE, DISPLAY_SIZE ], saver: { strip: true, quality: 82 }
  end

  normalizes :title, with: ->(title) { title.squish }
  normalizes :body, with: ->(body) { body.strip.gsub(/\r\n?/, "\n") }
  normalizes :link_path, :link_label, :screenshot_alt, with: ->(value) { value.strip.presence }

  validates :title, presence: true, length: { maximum: TITLE_MAX }
  validates :body, presence: true, length: { maximum: BODY_MAX }
  validates :published_on, presence: true
  validates :link_path, format: { with: LINK_PATTERN }, length: { maximum: 300 }, allow_nil: true
  validates :link_label, length: { maximum: 60 }
  validates :screenshot_alt, length: { maximum: 200 }
  validates :key, uniqueness: true, allow_nil: true
  validate :screenshot_is_acceptable

  scope :published, -> { where.not(published_at: nil).where(published_at: ..Time.current) }
  scope :newest_first, -> { order(published_on: :desc, published_at: :desc, id: :desc) }

  def published? = published_at.present? && published_at <= Time.current

  # Entries published since the person last opened « Nouveautés » (a new
  # account starts from its creation: the history is not news to them).
  def self.unseen_by(user)
    published.where(published_at: (user.release_notes_seen_at || user.created_at)..)
  end

  def paragraphs = body.split(/\n{2,}/).map(&:strip).reject(&:empty?)

  def screenshot_path
    return unless screenshot.attached?
    Rails.application.routes.url_helpers.screenshot_release_note_path(self, v: screenshot.blob.id)
  end

  # For the page: who liked it (oldest first, so the first ones keep their
  # place) and whether the viewer did.
  def as_inertia(likers:, liked:, likes_count: likers.size, seen_since: nil)
    {
      id:, title:, paragraphs:, publishedOn: published_on.iso8601,
      link: link_path && { path: link_path, label: link_label },
      screenshot: screenshot_path && { url: screenshot_path, alt: screenshot_alt.presence || title },
      likes: likers.map { |user| self.class.liker_json(user) },
      likesCount: likes_count,
      liked:,
      fresh: published? && seen_since.present? && published_at >= seen_since
    }
  end

  def self.liker_json(user) = { id: user.id, name: user.display_name, avatarUrl: user.avatar_url }

  def as_admin_json
    {
      id:, key:, title:, body:, publishedOn: published_on.iso8601, published: published?,
      publishedAt: published_at&.iso8601, linkPath: link_path, linkLabel: link_label,
      screenshotAlt: screenshot_alt, screenshotUrl: screenshot_path, likesCount: likes.size
    }
  end

  private
    def screenshot_is_acceptable
      return unless screenshot.attached?
      errors.add(:screenshot, :invalid_type) unless CONTENT_TYPES.include?(screenshot.blob.content_type)
      errors.add(:screenshot, :too_large) if screenshot.blob.byte_size > MAX_BYTES
    end
end

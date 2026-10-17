# A reader's answer to « Ce guide t'a aidé ? » at the bottom of a help
# article, with what was missing when it did not. Anyone may answer, signed
# in or not; staff read them in /admin/help.
class HelpFeedback < ApplicationRecord
  COMMENT_LIMIT = 1000

  belongs_to :user, optional: true

  validates :slug, presence: true
  validates :helpful, inclusion: { in: [ true, false ] }
  validates :comment, length: { maximum: COMMENT_LIMIT }
  validate :article_exists

  scope :newest_first, -> { order(created_at: :desc) }

  # Per article: { slug => { helpful:, unhelpful: } }.
  def self.tally
    group(:slug, :helpful).count.each_with_object(Hash.new { |h, k| h[k] = { helpful: 0, unhelpful: 0 } }) do |((slug, helpful), count), out|
      out[slug][helpful ? :helpful : :unhelpful] += count
    end
  end

  private
    def article_exists
      errors.add(:slug, :invalid) if slug.present? && HelpArticle.find(slug).nil?
    end
end

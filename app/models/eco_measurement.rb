# One EcoIndex measurement of one screen, sent by the « EcoIndex » workflow
# after each deployment (script/ecoindex.mjs, EcoMeasurementsController).
# Public pages are measured on production; the signed-in screens on a copy
# of the same commit started by the workflow (`environment` says which).
# Shown in the admin « Tech » view and on the public « Écoconception » page.
class EcoMeasurement < ApplicationRecord
  # In the order the pages show them.
  SCREENS = %w[home features pricing help sign_in ecoconception maps editor catalogue plant].freeze
  ENVIRONMENTS = %w[production test_copy].freeze
  HISTORY = 20

  validates :screen, inclusion: { in: SCREENS }
  validates :environment, inclusion: { in: ENVIRONMENTS }
  validates :url, :measured_at, presence: true
  validates :dom_elements, :requests, :bytes, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  before_validation :compute_index

  scope :chronological, -> { order(:measured_at, :id) }

  # The last measurement of each screen with, oldest first, the scores before it.
  def self.latest_with_history
    rows = where(id: select("DISTINCT ON (screen) id").order(:screen, measured_at: :desc, id: :desc)).index_by(&:screen)
    scores = recent_scores
    SCREENS.filter_map { |screen| rows[screen]&.then { |row| row.as_summary.merge(history: scores[screen] || []) } }
  end

  def self.recent_scores
    ranked = select("screen, score, measured_at, row_number() OVER (PARTITION BY screen ORDER BY measured_at DESC, id DESC) AS rank")
    from(ranked, :eco_measurements).where("rank <= ?", HISTORY).order(:measured_at)
      .pluck(:screen, :score).group_by(&:first).transform_values { |pairs| pairs.map(&:last) }
  end

  def as_summary
    { screen:, environment:, url:, score:, grade:, domElements: dom_elements, requests:, kilobytes: (bytes / 1024.0).round,
      gesGrams: ges_grams.to_f, waterCentiliters: water_centiliters.to_f, commit:, measuredAt: measured_at.iso8601 }
  end

  private
    def compute_index
      return if [ dom_elements, requests, bytes ].any?(&:nil?)
      result = EcoIndex.new(dom_elements:, requests:, kilobytes: bytes / 1024.0)
      self.score, self.grade, self.ges_grams, self.water_centiliters = result.to_h.values_at(:score, :grade, :ges_grams, :water_centiliters)
    end
end

# One reading of a fruit store (a MapFeature of kind "fruit_store"): the
# temperature and humidity on a day, and the min and max since the last
# reading when a min-max thermometer is there. StorageClimate says what
# they mean for the fruit.
class StorageReading < ApplicationRecord
  STORE_KIND = "fruit_store".freeze
  NOTE_MAX_LENGTH = 2000

  belongs_to :map_feature
  belongs_to :map
  belongs_to :user, optional: true

  validates :measured_on, presence: true
  validates :temperature_c, :temperature_min_c, :temperature_max_c, numericality: { greater_than: -40, less_than: 60 }, allow_nil: true
  validates :humidity_pct, numericality: { only_integer: true, in: 0..100 }, allow_nil: true
  validates :note, length: { maximum: NOTE_MAX_LENGTH }
  validate :measures_something
  validate :min_below_max
  validate :reads_a_store
  validate :not_in_the_future

  before_validation { self.map_id = map_feature.map_id if map_feature }

  scope :chronological, -> { order(:measured_on, :id) }
  scope :newest_first, -> { order(measured_on: :desc, id: :desc) }

  def as_json(*)
    {
      id:, featureId: map_feature_id, measuredOn: measured_on.iso8601,
      temperatureC: temperature_c&.to_f, temperatureMinC: temperature_min_c&.to_f, temperatureMaxC: temperature_max_c&.to_f,
      humidityPct: humidity_pct, note:, author: user&.display_name,
      verdict: StorageClimate.verdict(self)
    }
  end

  private
    def measures_something
      return if [ temperature_c, temperature_min_c, temperature_max_c, humidity_pct ].any?
      errors.add(:base, :nothing_measured)
    end

    def min_below_max
      errors.add(:temperature_min_c, :above_max) if temperature_min_c && temperature_max_c && temperature_min_c > temperature_max_c
    end

    def reads_a_store
      errors.add(:map_feature, :invalid) unless map_feature&.kind == STORE_KIND
    end

    def not_in_the_future
      errors.add(:measured_on, :in_future) if measured_on && measured_on > PlantableFeature.latest_today
    end
end

# Free tags a person puts on anything drawn on a map (plants, networks,
# structures…), shared by every element of the map: « zone nord »,
# « phase 1 », « à tailler ». Lists and tables filter and group by them.
#
# Tags are trimmed, single-spaced and deduplicated case-insensitively
# (the first spelling wins); order is kept as typed.
module MapFeature::Tags
  extend ActiveSupport::Concern

  MAX_TAGS = 20
  MAX_LENGTH = 40

  included do
    # Case-insensitive: « Phase 1 » finds « phase 1 ».
    scope :tagged, lambda { |tag|
      where("EXISTS (SELECT 1 FROM unnest(map_features.tags) AS t WHERE lower(t) = lower(?))", normalize_tag(tag))
    }
    before_validation :normalize_tags
    validate :validate_tags
  end

  class_methods do
    def normalize_tag(value) = value.to_s.unicode_normalize(:nfc).squish

    # The tags used in a scope (a map's features), one spelling each, sorted
    # the French way, with how many elements carry them.
    #
    #   map.features.where.not(status: "rejected").tag_counts
    #   # => { "phase 1" => 12, "Zone nord" => 4 }
    def tag_counts
      rows = unscope(:order).pluck(Arel.sql("unnest(map_features.tags)"))
      counts = rows.group_by(&:downcase).to_h { |_, spellings| [ spellings.first, spellings.size ] }
      counts.sort_by { |tag, _| I18n.transliterate(tag).downcase }.to_h
    end
  end

  def tags=(values)
    list = values.is_a?(String) ? values.split(",") : Array(values)
    super(list)
  end

  private
    def normalize_tags
      self.tags = Array(tags).map { |tag| self.class.normalize_tag(tag) }.reject(&:blank?)
                             .uniq(&:downcase)
    end

    def validate_tags
      errors.add(:tags, :too_many_tags, count: MAX_TAGS) if tags.size > MAX_TAGS
      errors.add(:tags, :tag_too_long, count: MAX_LENGTH) if tags.any? { |tag| tag.length > MAX_LENGTH }
    end
end

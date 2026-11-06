# The functions a person gives an element (`properties.functions`, a list of
# ElementFunctions::FUNCTIONS), when the ones proposed from its kind or its
# species do not fit: a hedge that is also a fire break, a tree kept for its
# shade. Stored in the order of the vocabulary; an empty list means « none »,
# no key means « the proposed ones ».
#
# `properties.serves`: the functions of the project's functional analysis
# (ProjectSheet "analysis", by id) the element serves: « S'émerveiller »,
# « Accueillir la biodiversité »… An id the analysis no longer has is simply
# ignored by the review.
module MapFeature::Functions
  extend ActiveSupport::Concern

  included do
    before_validation :normalize_functions
    validate :validate_functions
  end

  SERVES_MAX = 40

  private
    def normalize_functions
      normalize_serves
      value = properties&.dig("functions")
      return if value.nil?
      properties["functions"] = value.is_a?(Array) ? value.map(&:to_s).uniq.sort_by { |f| ElementFunctions::FUNCTIONS.index(f) || ElementFunctions::FUNCTIONS.size } : value
    end

    def normalize_serves
      value = properties&.dig("serves")
      return if value.nil?
      return properties.delete("serves") if value == []
      properties["serves"] = value.map(&:to_s).uniq if value.is_a?(Array)
    end

    def validate_functions
      serves = properties&.dig("serves")
      unless serves.nil? || (serves.is_a?(Array) && serves.size <= SERVES_MAX && serves.all? { _1.is_a?(String) && _1.match?(/\A[\w-]{1,40}\z/) })
        errors.add(:base, :element_serves, message: I18n.t("element_functions.errors.serves"))
      end
      value = properties&.dig("functions")
      return if value.nil?
      return if value.is_a?(Array) && (value - ElementFunctions::FUNCTIONS).empty?
      errors.add(:base, :element_functions, message: I18n.t("element_functions.errors.unknown"))
    end
end

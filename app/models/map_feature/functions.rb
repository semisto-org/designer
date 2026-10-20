# The functions a person gives an element (`properties.functions`, a list of
# ElementFunctions::FUNCTIONS), when the ones proposed from its kind or its
# species do not fit: a hedge that is also a fire break, a tree kept for its
# shade. Stored in the order of the vocabulary; an empty list means « none »,
# no key means « the proposed ones ».
module MapFeature::Functions
  extend ActiveSupport::Concern

  included do
    before_validation :normalize_functions
    validate :validate_functions
  end

  private
    def normalize_functions
      value = properties&.dig("functions")
      return if value.nil?
      properties["functions"] = value.is_a?(Array) ? value.map(&:to_s).uniq.sort_by { |f| ElementFunctions::FUNCTIONS.index(f) || ElementFunctions::FUNCTIONS.size } : value
    end

    def validate_functions
      value = properties&.dig("functions")
      return if value.nil?
      return if value.is_a?(Array) && (value - ElementFunctions::FUNCTIONS).empty?
      errors.add(:base, :element_functions, message: I18n.t("element_functions.errors.unknown"))
    end
end

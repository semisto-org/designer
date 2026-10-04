# Common names of a catalogue record, per language, in display order.
module CommonNamed
  extend ActiveSupport::Concern

  included do
    has_many :common_names, -> { order(:position, :id) }, class_name: "PlantCommonName", as: :nameable, dependent: :delete_all
  end

  def common_name(language = "fr")
    common_names.detect { |n| n.language == language }&.name
  end

  # Replaces the common names of one language, keeping their order.
  def replace_common_names!(names, language: "fr")
    names = Array(names).map { |n| n.to_s.squish }.reject(&:blank?).uniq { |n| n.downcase }
    transaction do
      common_names.where(language:).delete_all
      names.each_with_index { |name, i| common_names.create!(language:, name:, position: i) }
    end
    common_names.reset
  end
end

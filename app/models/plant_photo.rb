# A free photo of a species, shown on the catalogue card and the species
# sheet. Copied from Wikimedia Commons (PlantPhotoJob) rather than linked, so
# the catalogue never depends on Wikimedia being up, with what its licence
# asks to show next to it: the author, the licence and the file's page.
#
# `position` 0 is the main photo; the others leave room for a gallery
# (flowers, fruits, bark through the seasons).
class PlantPhoto < ApplicationRecord
  SOURCES = %w[wikimedia_commons].freeze

  belongs_to :species, class_name: "PlantSpecies", inverse_of: :photos

  has_one_attached :image do |attachable|
    attachable.variant :card, resize_to_fill: [ 640, 480 ], format: :jpeg, saver: { strip: true, quality: 80 }
    attachable.variant :large, resize_to_limit: [ 1600, 1600 ], format: :jpeg, saver: { strip: true, quality: 85 }
  end

  validates :source, inclusion: { in: SOURCES }
  validates :file_title, presence: true, uniqueness: { scope: :species_id }
  validates :license, presence: true
  validates :page_url, format: { with: %r{\Ahttps://\S+\z} }
  validates :license_url, format: { with: %r{\Ahttps?://\S+\z} }, allow_blank: true

  def self.from_commons(species, image, bytes)
    photo = species.photos.new(
      source: "wikimedia_commons", position: species.photos.size, file_title: image.file_title,
      author: image.author, license: image.license, license_url: image.license_url, page_url: image.page_url,
      width: image.width, height: image.height
    )
    extension = File.extname(image.file_title).downcase.presence || ".jpg"
    photo.image.attach(io: StringIO.new(bytes), filename: "#{species.latin_name.parameterize}#{extension}")
    photo.save!
    photo
  end

  # The credit Commons asks for, and the variant to show.
  def as_json(*)
    return nil unless image.attached?

    {
      url: url(:large), cardUrl: url(:card), author:, license:, licenseUrl: license_url, pageUrl: page_url,
      source:, width:, height:
    }
  end

  private
    def url(variant) = Rails.application.routes.url_helpers.rails_representation_path(image.variant(variant), only_path: true)
end

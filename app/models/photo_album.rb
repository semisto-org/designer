# A simple album to sort the photos of a map (« Verger, avant travaux »).
class PhotoAlbum < ApplicationRecord
  belongs_to :map
  has_many :photos, class_name: "MapPhoto", foreign_key: :photo_album_id, inverse_of: :album, dependent: :nullify

  validates :name, presence: true, length: { maximum: 80 }

  scope :ordered, -> { order(:position, :id) }

  def as_inertia(photos_count: nil)
    { id:, name:, description:, position:, photosCount: photos_count || photos.count }
  end
end

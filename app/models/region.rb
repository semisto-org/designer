# A territory with its own data providers: map layers, cadastre, elevation,
# regulatory rules and native species. Wallonia first, then France,
# Luxembourg, Flanders and the Netherlands, without rewriting the app.
class Region < ApplicationRecord
  has_many :layers, -> { order(:position) }, class_name: "RegionLayer", dependent: :destroy
  has_many :maps, dependent: :restrict_with_error

  validates :key, :name, :country_code, presence: true
  validates :key, uniqueness: true

  scope :active, -> { where(active: true) }

  def self.default
    active.find_by(key: "wallonia") || active.first
  end

  def setting(*path)
    settings.dig(*path.map(&:to_s))
  end

  def as_inertia
    {
      id:, key:, name:,
      center: center && [ center.x, center.y ],
      bounds: bounds && RGeo::Cartesian::BoundingBox.create_from_geometry(bounds).then { |b| [ b.min_x, b.min_y, b.max_x, b.max_y ] },
      defaultZoom: default_zoom
    }
  end
end

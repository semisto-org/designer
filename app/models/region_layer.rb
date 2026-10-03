class RegionLayer < ApplicationRecord
  KINDS = %w[wms xyz arcgis_rest].freeze
  CATEGORIES = %w[base overlay].freeze

  belongs_to :region

  validates :key, :name, :url, presence: true
  validates :kind, inclusion: { in: KINDS }
  validates :category, inclusion: { in: CATEGORIES }
  validates :key, uniqueness: { scope: :region_id }

  scope :enabled, -> { where(enabled: true) }

  def identifiable?
    identify_url.present?
  end

  def as_inertia
    {
      id:, key:, name:, group: group_name, category:, kind:,
      layers:, attribution:, opacity:, legendUrl: legend_url,
      minZoom: min_zoom, maxZoom: max_zoom, identifiable: identifiable?,
      proxied:, url: proxied ? nil : url, options:
    }
  end
end

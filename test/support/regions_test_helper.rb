# The real regions (Europe base, Wallonia, France, Luxembourg) and their
# catalogues, from the seed files.
module RegionsTestHelper
  SEEDS = %w[01_regions 02_wallonia_layers 03_europe_layers 04_france_layers 05_luxembourg_layers 40_relief 50_regulatory_rules].freeze

  def seed_regions
    SEEDS.each { |name| load Rails.root.join("db/seeds/#{name}.rb").to_s }
    Region.find_each(&:reload)
  end

  def region(key) = Region.find_by!(key:)
end

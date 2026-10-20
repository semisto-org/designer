# What each element of a design does, needs and gives, and the review of a
# map that follows from it (Lawton's element analysis, in its light form):
# is every important function served by at least two elements, and does
# something on the place give what each element needs?
#
# An element's functions come from its own `properties.functions` when the
# person set them, else from its kind (config/map_elements.yml) or, for a
# plant or a patch, from its species (edible parts and ecological services
# in the catalogue). Needs and yields come from the kind (plants yield food
# when edible, organic matter when the catalogue says so).
#
# Plants of one species count as one element: twelve apple trees fall to the
# same disease, so they are one way of producing food, not twelve.
class ElementFunctions
  FUNCTIONS = %w[food water fertility soil_protection windbreak shade microclimate habitat pollination wood fire_protection].freeze
  RESOURCES = %w[water organic_matter compost food wood heat].freeze
  # A function served by fewer elements than this is fragile: one failure and it is gone.
  ENOUGH = 2

  # Catalogue ecological services (PlantVocabulary eco_services) → functions.
  SPECIES_FUNCTIONS = {
    "nitrogen" => "fertility", "minerals" => "fertility", "organic-matter" => "fertility",
    "mellifere" => "pollination", "cross-pollination" => "pollination",
    "windbreak" => "windbreak", "beneficial-insects" => "habitat", "birds" => "habitat",
    "ground-cover" => "soil_protection", "erosion-control" => "soil_protection", "light-shade" => "shade"
  }.freeze
  WOODY_STRATA = %w[canopy sub_canopy].freeze
  # Shapes of the editor shell (a zone, a line, a point): no default, the person says.
  GENERIC_KINDS = %w[zone line point].freeze

  Entry = Data.define(:key, :label, :kind, :feature_ids, :functions, :origin, :needs, :yields, :existing) do
    def as_json(*)
      { key:, label:, kind:, featureIds: feature_ids, functions:, origin:, needs:, yields:, existing: }
    end
  end

  # Whether a feature takes part in the review (and gets the inspector section).
  def self.applies?(feature)
    return false if feature.layer == "notes"
    feature.plant? || feature.patch? || GENERIC_KINDS.include?(feature.kind) || MapElements.find(feature.kind)&.functions
  end

  # The functions a person set on a feature (nil: none set, the defaults apply).
  def self.own(feature)
    value = feature.properties["functions"]
    value.is_a?(Array) ? value & FUNCTIONS : nil
  end

  def self.normalize(values)
    FUNCTIONS & Array(values).map(&:to_s)
  end

  def initialize(map)
    @map = map
  end

  def entries
    @entries ||= build_entries
  end

  def as_json(*)
    { functions: FUNCTIONS, enough: ENOUGH, entries: entries.map(&:as_json), balance:, unmetNeeds: unmet_needs }
  end

  # One row per function: how many elements serve it, and which.
  def balance
    FUNCTIONS.map do |function|
      serving = entries.select { |e| e.functions.include?(function) }
      status = serving.empty? ? "missing" : serving.size < ENOUGH ? "fragile" : "covered"
      { function:, count: serving.size, status:, entries: serving.map(&:key), existingOnly: serving.any? && serving.all?(&:existing) }
    end
  end

  # What some element needs and nothing on the place gives: work or a purchase, every year.
  def unmet_needs
    given = entries.flat_map(&:yields).to_set
    RESOURCES.filter_map do |resource|
      next if given.include?(resource)
      needing = entries.select { |e| e.needs.include?(resource) }
      { resource:, entries: needing.map(&:key) } if needing.any?
    end
  end

  private
    def features
      @features ||= @map.features.active.where.not(layer: "notes").includes(:patch_items).to_a.select { |f| self.class.applies?(f) }
    end

    def species
      @species ||= begin
        ids = features.flat_map { |f| f.plant? ? [ f.plant_species_id ] : f.patch? ? f.patch_items.map(&:species_id) : [] }.compact.uniq
        ids.empty? ? {} : PlantSpecies.where(id: ids).includes(:common_names).index_by(&:id)
      end
    end

    def build_entries
      plants, others = features.partition { |f| f.plant? && self.class.own(f).nil? }
      grouped = plants.group_by(&:plant_species_id).filter_map do |species_id, group|
        sp = species[species_id]
        next unless sp
        label = sp.common_name || sp.latin_name
        label = "#{label} ×#{group.size}" if group.size > 1
        Entry.new(key: "species:#{species_id}", label:, kind: "plant", feature_ids: group.map(&:id),
          functions: species_functions([ sp ]), origin: "species", needs: [], yields: species_yields([ sp ]), existing: false)
      end
      grouped + others.map { |f| feature_entry(f) }
    end

    def feature_entry(feature)
      element = MapElements.find(feature.kind)
      own = self.class.own(feature)
      list = feature.plant? ? [ species[feature.plant_species_id] ].compact : feature.patch? ? feature.patch_items.filter_map { |i| species[i.species_id] } : nil
      defaults = list ? species_functions(list) : Array(element&.functions)
      Entry.new(
        key: "feature:#{feature.id}", label: label(feature, list), kind: feature.kind, feature_ids: [ feature.id ],
        functions: own || defaults, origin: own ? "own" : list ? "species" : "kind",
        needs: Array(element&.needs), yields: list ? species_yields(list) : Array(element&.yields),
        existing: feature.layer == "existing"
      )
    end

    def label(feature, list)
      return feature.name if feature.name.present?
      return list.first.then { |s| s.common_name || s.latin_name } if feature.plant? && list.present?
      MapElements.label(feature.kind)
    end

    def species_functions(list)
      found = list.flat_map do |sp|
        [ ("food" if sp.edible_parts.any?), ("wood" if WOODY_STRATA.include?(sp.default_strata)) ] + sp.eco_services.map { |s| SPECIES_FUNCTIONS[s] }
      end
      FUNCTIONS & found.compact
    end

    def species_yields(list)
      found = list.flat_map do |sp|
        [ ("food" if sp.edible_parts.any?), ("organic_matter" if (sp.eco_services & %w[organic-matter pioneer nitrogen]).any?) ]
      end
      RESOURCES & found.compact
    end
end

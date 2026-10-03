# Coherence alerts of a map's planting. Recomputed on every read, never
# stored, never blocking a save: an alert draws attention, the designer
# decides. Messages and explanations live in plant_alerts.* (plants.fr.yml).
#
# Rules (level):
#   density     (warning) a strata of a patch out of its density range,
#                         or one line alone above the ceiling;
#   exposure    (warning) a patch exposure the species does not like;
#   hardiness   (warning) a species less hardy than the site's zone;
#   invasive    (warning) a species invasive in the map's country;
#   nitrogen    (warning/info) too few nitrogen fixers among woody plants;
#   strata      (info)    key strata missing from a planting of some size;
#   pollination (warning) a self-sterile or dioecious species without partner.
#
# Density rule ported from Terranova (ConceptAlerts#density_alerts): judged on
# the TOTAL of each strata on a patch, since a forest-garden patch mixes
# several species of one strata. The calibration rule is gone (a real map
# always knows its areas); supply, status and soil rules belong elsewhere.
class PlantingAlerts
  LEVELS = %w[blocking warning info].freeze
  WOODY_STRATA = %w[canopy sub_canopy shrub].freeze
  KEY_STRATA = [ %w[canopy sub_canopy], %w[shrub], %w[herbaceous], %w[ground_cover] ].freeze
  NITROGEN_MIN_WOODY = 5
  NITROGEN_MIN_SHARE = 0.1
  STRATA_MIN_PLANTS = 10
  POLLINATION_FERTILITY = %w[self-sterile dioecious].freeze

  Alert = Data.define(:level, :rule, :message, :feature_id, :species_id) do
    def initialize(level:, rule:, message:, feature_id: nil, species_id: nil) = super

    def as_json(*) = { level:, rule:, message:, featureId: feature_id, speciesId: species_id }
  end

  attr_reader :quantities

  def initialize(quantities)
    @quantities = quantities
  end

  def alerts
    @alerts ||= (patch_alerts + species_alerts + nitrogen_alerts + strata_alerts + pollination_alerts)
                .sort_by.with_index { |alert, i| [ LEVELS.index(alert.level), i ] }
  end

  def for_feature(feature_id) = alerts.select { |a| a.feature_id == feature_id }

  def counts = alerts.group_by(&:level).transform_values(&:size)

  def as_json(*) = { alerts: alerts.map(&:as_json), counts:, zone: map.hardiness_zone }

  private
    def map = quantities.map
    def species_index = quantities.species_index

    def t(key, **vars) = I18n.t("plant_alerts.messages.#{key}", **vars)

    def name_of(species) = species.common_name || species.latin_name

    def strata_label(strata) = I18n.t("plants.strata.#{strata}", default: strata.to_s)

    # Species the design is about: in the palette or planned somewhere.
    def design_species
      ids = quantities.palette.map(&:species_id) | quantities.by_key.select { |_, slot| slot.planned.positive? }.keys.map(&:first)
      ids.filter_map { |id| species_index[id] }.sort_by { |s| s.latin_name.downcase }
    end

    # ── Per patch ───────────────────────────────────────────────────────────

    def patch_alerts
      quantities.patches.flat_map { |patch| density_alerts(patch) + exposure_alerts(patch) }
    end

    def density_alerts(patch)
      area = patch.area_m2.to_f
      return [] unless area.positive?
      patch.lines.group_by(&:strata).flat_map do |strata, lines|
        range = StrataDensity.range_for(strata)
        next [] unless range
        total = lines.sum(&:quantity)
        next [] if total < 1

        crowded = lines.select { |line| line.quantity >= 1 && line.quantity / area > range.max }
        found = crowded.map do |line|
          density_alert("density_item_high", patch, range, line.quantity / area, strata, name: name_of(line.item.species), species_id: line.item.species_id)
        end
        density = total / area
        if density < range.min
          found << density_alert("density_low", patch, range, density, strata)
        elsif density > range.max && crowded.empty?
          found << density_alert("density_high", patch, range, density, strata)
        end
        found
      end
    end

    def density_alert(key, patch, range, density, strata, name: nil, species_id: nil)
      Alert.new(level: "warning", rule: "density", feature_id: patch.feature.id, species_id:,
                message: t(key, name:, patch: patch_name(patch), strata: strata_label(strata),
                                density: readable_density(density, range), min: number(range.min), max: number(range.max)))
    end

    def exposure_alerts(patch)
      exposure = patch.feature.properties["exposure"].presence
      return [] unless exposure
      patch.lines.filter_map do |line|
        species = line.item.species
        next if species.exposures.empty? || species.exposures.include?(exposure)
        Alert.new(level: "warning", rule: "exposure", feature_id: patch.feature.id, species_id: species.id,
                  message: t("exposure", name: name_of(species), patch: patch_name(patch),
                                         exposure: vocabulary(:exposures, exposure).downcase,
                                         preferred: species.exposures.map { |e| vocabulary(:exposures, e).downcase }.to_sentence))
      end
    end

    def patch_name(patch) = patch.feature.name.presence || I18n.t("plant_alerts.unnamed_patch")

    # ── Per species ─────────────────────────────────────────────────────────

    def species_alerts
      zone = map.hardiness_zone
      country = map.country_code
      design_species.flat_map do |species|
        found = []
        if zone && species.hardiness_zone && species.hardiness_zone > zone
          found << Alert.new(level: "warning", rule: "hardiness", species_id: species.id,
                             message: t("hardiness", name: name_of(species), zone: species.hardiness_zone,
                                                     temperature: number(species.min_temperature_c), site_zone: zone,
                                                     site_temperature: number(map.min_temperature_c)))
        end
        if species.invasive_in?(country)
          found << Alert.new(level: "warning", rule: "invasive", species_id: species.id,
                             message: t("invasive", name: name_of(species), country: I18n.t("plant_alerts.countries.#{country}", default: country)))
        end
        found
      end
    end

    # ── Whole planting ──────────────────────────────────────────────────────

    def planned_by_strata
      @planned_by_strata ||= quantities.by_key.each_with_object(Hash.new(0)) do |(key, slot), totals|
        totals[quantities.strata_for(key)] += slot.planned if slot.planned.positive?
      end
    end

    def nitrogen_alerts
      woody = quantities.by_key.select { |key, slot| slot.planned.positive? && WOODY_STRATA.include?(quantities.strata_for(key)) }
      woody_total = woody.values.sum(&:planned)
      return [] if woody_total < NITROGEN_MIN_WOODY
      fixers = woody.select { |key, _| species_index[key.first]&.nitrogen_fixer? }.values.sum(&:planned)
      share = fixers.to_f / woody_total
      if fixers.zero?
        [ Alert.new(level: "warning", rule: "nitrogen", message: t("nitrogen_none", count: woody_total)) ]
      elsif share < NITROGEN_MIN_SHARE
        [ Alert.new(level: "info", rule: "nitrogen", message: t("nitrogen_low", share: (share * 100).round, fixers:, count: woody_total)) ]
      else
        []
      end
    end

    def strata_alerts
      return [] if quantities.total < STRATA_MIN_PLANTS
      missing = KEY_STRATA.reject { |group| group.any? { |strata| planned_by_strata[strata].positive? } }
      return [] if missing.empty?
      labels = missing.map { |group| group.map { |s| strata_label(s).downcase }.join(" / ") }
      [ Alert.new(level: "info", rule: "strata", message: t("strata_missing", strata: labels.to_sentence, count: missing.size)) ]
    end

    # A self-sterile cultivar planted alone, or a single dioecious plant, will
    # never fruit. Two distinct cultivars are two partners; three plants of
    # ONE cultivar are clones, one partner; seedlings of the bare species are
    # all different.
    def pollination_alerts
      quantities.by_key.select { |_, slot| slot.planned.positive? }.group_by { |key, _| key.first }.filter_map do |species_id, entries|
        species = species_index[species_id]
        fertility = species&.fertility
        next unless POLLINATION_FERTILITY.include?(fertility)
        partners = entries.sum { |(_, variety_id), slot| variety_id.nil? ? slot.planned : 1 }
        next if partners >= 2
        Alert.new(level: "warning", rule: "pollination", species_id:,
                  message: t("pollination_#{fertility.underscore}", name: name_of(species)))
      end
    end

    # ── Formatting ──────────────────────────────────────────────────────────

    def vocabulary(facet, key) = I18n.t("plants.vocabulary.#{facet}.#{key}", default: key.to_s)

    def number(value, precision = 2)
      return "?" if value.nil?
      ActiveSupport::NumberHelper.number_to_rounded(value, precision:, strip_insignificant_zeros: true, separator: ",", delimiter: " ")
    end

    # Just enough decimals for the printed value to be visibly out of the
    # printed range (0,00885 must not print as the 0,01 bound it violates).
    def readable_density(value, range)
      precision = (2..4).find { |p| value.round(p) < range.min || value.round(p) > range.max } || 4
      number(value, precision)
    end
end

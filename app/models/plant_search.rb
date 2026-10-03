# Catalogue search for a forest-garden designer: free text (latin, common
# and cultivar names, accents ignored) and the facets that decide a design.
# Multi-valued facets are an OR inside the facet (« sun OR partial shade »),
# facets combine with AND. Hardiness: « hardy down to zone N » means the
# plant's zone is ≤ N; plants of unknown hardiness are left out by that
# filter (on that criterion, missing data is not an answer).
#
# Logic ported from Terranova (Plant::SpeciesSearch), over canonical arrays.
class PlantSearch
  PER_PAGE = 24
  LIST_FACETS = %i[strata plant_type exposures soil_moisture].freeze
  FLAGS = %i[edible nitrogen mellifere native no_invasive].freeze

  STRATA_SQL = "COALESCE(plant_species.strata, CASE plant_species.plant_type " +
    PlantSpecies::STRATA_BY_PLANT_TYPE.map { |type, strata| "WHEN '#{type}' THEN '#{strata}'" }.join(" ") +
    " ELSE 'shrub' END)"

  attr_reader :params, :country

  def initialize(params = {}, country: nil)
    @params = (params.respond_to?(:to_unsafe_h) ? params.to_unsafe_h : params.to_h).with_indifferent_access
    @country = country.presence&.upcase
  end

  def query = params[:q].to_s.squish.first(100)

  def selected(facet)
    allowed = facet == :strata ? PlantVocabulary::STRATA : PlantVocabulary.keys(facet)
    Array(params[facet]).flat_map { |v| v.to_s.split(",") }.map(&:strip) & allowed
  end

  def zone
    z = params[:zone].to_s
    z.match?(/\A\d{1,2}\z/) && z.to_i.between?(1, 13) ? z.to_i : nil
  end

  def flag?(name) = %w[1 true].include?(params[name].to_s)

  def page = [ params[:page].to_i, 1 ].max

  def filters
    {
      q: query.presence, zone:, **LIST_FACETS.to_h { |f| [ f, selected(f) ] },
      **FLAGS.to_h { |f| [ f, flag?(f) ] }
    }
  end

  def scope
    scope = PlantSpecies.matching(query)
    selected(:strata).then { |v| scope = scope.where("#{STRATA_SQL} IN (?)", v) if v.any? }
    selected(:plant_type).then { |v| scope = scope.where(plant_type: v) if v.any? }
    %i[exposures soil_moisture].each do |facet|
      values = selected(facet)
      scope = scope.where("plant_species.#{facet} && ARRAY[?]::varchar[]", values) if values.any?
    end
    scope = scope.where(hardiness_zone: ..zone) if zone
    scope = scope.where("plant_species.edible_rating IS NOT NULL OR cardinality(plant_species.edible_parts) > 0") if flag?(:edible)
    scope = scope.where("'nitrogen' = ANY(plant_species.eco_services)") if flag?(:nitrogen)
    scope = scope.where("'mellifere' = ANY(plant_species.eco_services)") if flag?(:mellifere)
    scope = scope.where("? = ANY(plant_species.native_countries)", country) if flag?(:native) && country
    scope = scope.where.not("? = ANY(plant_species.invasive_countries)", country) if flag?(:no_invasive) && country
    scope
  end

  def total = @total ||= scope.count

  def pages = [ (total / PER_PAGE.to_f).ceil, 1 ].max

  def results
    scope.alphabetical.with_card_data.offset((page - 1) * PER_PAGE).limit(PER_PAGE)
  end

  def as_json(*)
    { results: results.map(&:summary_json), total:, page:, pages:, perPage: PER_PAGE, filters: }
  end
end

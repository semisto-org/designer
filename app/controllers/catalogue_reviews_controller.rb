# The species people proposed from their palettes, for the catalogue
# reviewers (User#can_review_catalogue?): accept one (corrected if needed)
# into the shared catalogue, merge it into the species it duplicates, or keep
# it off the shared catalogue (it stays on the maps that use it).
#
# Jev can check each species' values against open pages first
# (Catalog::ValueCheck, `check`): the queue then opens on the species ready
# to accept (GBIF knows the name, no page contradicts a value), then those
# that need a look, then those not checked yet.
class CatalogueReviewsController < ApplicationController
  STATES = %w[ready attention unchecked].freeze

  before_action :require_reviewer!
  before_action :set_species, only: %i[update merge reject gbif check]

  def index
    species = PlantSpecies.proposed.includes(:common_names, :field_sources, :proposed_by, :proposed_map, :genus, :value_checks)
                          .order(:created_at, :id).to_a
    maps = PaletteItem.where(species_id: species.map(&:id)).joins(:map).merge(Map.active)
                      .pluck(:species_id, "maps.id", "maps.name").group_by(&:first)
    proposals = species.map { |s| proposal_json(s, maps.fetch(s.id, [])) }.sort_by.with_index { |p, i| [ STATES.index(p[:state]), i ] }
    render inertia: "catalogue_reviews/index", props: {
      proposals:,
      summary: STATES.index_with { |state| proposals.count { _1[:state] == state } },
      jevAvailable: Providers::Jev.build.available?,
      vocabulary: { strata: PlantVocabulary::STRATA }
    }
  end

  # Asks Jev to check the values of every species not checked yet (or of one,
  # with an id), in the background; the page follows the verdicts as they come.
  def check
    unless Providers::Jev.build.available?
      return redirect_to(catalogue_reviews_path, alert: t("plants.review.flash.jev_unavailable"), status: :see_other)
    end
    targets = @species ? [ @species ] : PlantSpecies.proposed.where(values_checked_at: nil, values_check_requested_at: [ nil, ..1.hour.ago ])
    ids = targets.map(&:id)
    PlantSpecies.where(id: ids).update_all(values_check_requested_at: Time.current)
    ids.each { PlantValueCheckJob.perform_later(_1) }
    redirect_to catalogue_reviews_path, notice: t("plants.review.flash.checking", count: ids.size), status: :see_other
  end

  # Accepts the species into the shared catalogue, with the corrections the
  # reviewer made to its name, French name or strata.
  def update
    PlantSpecies.transaction do
      @species.assign_attributes(review_params.slice(:latin_name).compact_blank)
      @species.genus = PlantGenus.for_latin_name(@species.latin_name) if @species.latin_name_changed?
      @species.assign_attributes(review_status: "reviewed", reviewed_by: Current.user, reviewed_at: Time.current)
      values = review_params.slice(:strata).compact_blank.to_h
      # The chosen name comes first (the one shown everywhere); the names the
      # species already had stay as synonyms, so a name in use is not lost.
      names = review_params[:common_name].present? ? [ review_params[:common_name], *french_names(@species) ] : nil
      Catalog::SpeciesWriter.new(source: "semisto", status: "to_verify").write(@species, values, common_names: names)
      apply_checks(@species, Array(params.dig(:review, :take)).map(&:to_s))
    end
    redirect_to catalogue_reviews_path, notice: t("plants.review.flash.accepted", name: @species.latin_name), status: :see_other
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique
    redirect_to catalogue_reviews_path, alert: t("plants.review.flash.invalid", name: review_params[:latin_name]), status: :see_other
  end

  # What GBIF says about the proposed name, fetched card by card when the
  # queue opens: its status (accepted, outdated, misspelt, unknown) and the
  # common names it knows in the reviewer's language. Species imported from
  # a list never went through the check of Catalog::SpeciesProposal, so a
  # name GBIF accepts as is gets its key and family here.
  def gbif
    gbif = Providers::Gbif.build
    match = gbif.match(@species.latin_name)
    if match.status == "accepted" && match.name == @species.latin_name && @species.gbif_key.nil?
      @species.update_columns(gbif_key: match.key, family: @species.family || match.family)
    end
    language = I18n.locale.to_s
    known = @species.common_names.select { _1.language == language }.map { _1.name.downcase }
    names = match.key && match.status != "unknown" ? gbif.common_names(match.key).select { _1.language == language } : []
    render json: {
      match: match.as_json,
      commonNames: names.first(5).map { _1.as_json.merge(known: known.include?(_1.name.downcase)) }
    }
  rescue Providers::Gbif::Unavailable
    render json: { match: { status: "unavailable" }, commonNames: [] }
  end

  def merge
    target = PlantSpecies.reviewed.find_by(id: params[:target_id])
    return redirect_to(catalogue_reviews_path, alert: t("plants.review.flash.no_target"), status: :see_other) if target.nil? || target == @species
    name = @species.latin_name
    Catalog::SpeciesMerge.new(@species, target).call
    redirect_to catalogue_reviews_path, notice: t("plants.review.flash.merged", name:, target: target.latin_name), status: :see_other
  end

  def reject
    @species.update!(review_status: "rejected", reviewed_by: Current.user, reviewed_at: Time.current)
    redirect_to catalogue_reviews_path, notice: t("plants.review.flash.rejected", name: @species.latin_name), status: :see_other
  end

  private
    def require_reviewer!
      head :not_found unless Current.user&.can_review_catalogue?
    end

    def set_species
      @species = PlantSpecies.proposed.find(params[:id]) if params[:id] || action_name != "check"
    end

    # What Jev's check brings to an accepted species: a value a page confirms
    # becomes « sourced » from that page; a value a page contradicts is
    # replaced by the page's when the reviewer took it (`take`). The rest
    # stays « to verify ».
    def apply_checks(species, take)
      species.value_checks.each do |check|
        next unless check.source
        license = PlantSource.default_license(check.source)
        if check.verdict == "confirmed"
          species.record_provenance!([ check.field ], source: check.source, url: check.url, status: "sourced", license:)
        elsif check.verdict == "contradicted" && take.include?(check.field)
          Catalog::SpeciesWriter.new(source: check.source, status: "sourced", url: check.url, license:)
                                .write(species, { check.field => check.source_value })
        end
      end
    end

    def check_state(species)
      requested, checked = species.values_check_requested_at, species.values_checked_at
      return "pending" if requested && (checked.nil? || checked < requested)
      return "error" if species.values_check_error.present?
      checked ? "done" : "none"
    end

    def french_names(species)
      species.common_names.select { _1.language == I18n.locale.to_s }.map(&:name)
    end

    def review_params
      params.fetch(:review, {}).permit(:latin_name, :common_name, :strata)
    end

    def proposal_json(species, maps)
      checks = species.value_checks.to_a
      state = if check_state(species) != "done" then "unchecked"
      elsif species.gbif_key.present? && checks.none? { _1.verdict == "contradicted" } then "ready"
      else "attention"
      end
      species.summary_json.merge(
        state:,
        check: { state: check_state(species), error: species.values_check_error, results: checks.map(&:as_json) },
        family: species.family,
        gbifUrl: species.gbif_key && "https://www.gbif.org/species/#{species.gbif_key}",
        proposedBy: species.proposed_by&.display_name,
        proposedAt: species.created_at.iso8601,
        maps: maps.map { |(_, id, name)| { id:, name: } },
        values: (PlantSpecies.provenanced_fields - [ "common_names" ]).filter_map do |field|
          source = species.provenance_for(field)&.source
          next unless source && species.field_value_present?(field)
          { field:, value: species.public_send(field), source: }
        end
      )
    end
end

# The species people proposed from their palettes, for the catalogue
# reviewers (User#can_review_catalogue?): accept one (corrected if needed)
# into the shared catalogue, merge it into the species it duplicates, or keep
# it off the shared catalogue (it stays on the maps that use it).
class CatalogueReviewsController < ApplicationController
  before_action :require_reviewer!
  before_action :set_species, only: %i[update merge reject gbif]

  def index
    species = PlantSpecies.proposed.includes(:common_names, :field_sources, :proposed_by, :proposed_map, :genus)
                          .order(:created_at, :id).to_a
    maps = PaletteItem.where(species_id: species.map(&:id)).joins(:map).merge(Map.active)
                      .pluck(:species_id, "maps.id", "maps.name").group_by(&:first)
    render inertia: "catalogue_reviews/index", props: {
      proposals: species.map { |s| proposal_json(s, maps.fetch(s.id, [])) },
      vocabulary: { strata: PlantVocabulary::STRATA }
    }
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
      @species = PlantSpecies.proposed.find(params[:id])
    end

    def french_names(species)
      species.common_names.select { _1.language == I18n.locale.to_s }.map(&:name)
    end

    def review_params
      params.fetch(:review, {}).permit(:latin_name, :common_name, :strata)
    end

    def proposal_json(species, maps)
      species.summary_json.merge(
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

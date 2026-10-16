# The species people proposed from their palettes, for the catalogue
# reviewers (User#can_review_catalogue?): accept one (corrected if needed)
# into the shared catalogue, merge it into the species it duplicates, or keep
# it off the shared catalogue (it stays on the maps that use it).
class CatalogueReviewsController < ApplicationController
  before_action :require_reviewer!
  before_action :set_species, only: %i[update merge reject]

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
      names = review_params[:common_name].present? ? [ review_params[:common_name] ] : nil
      Catalog::SpeciesWriter.new(source: "semisto", status: "to_verify").write(@species, values, common_names: names)
    end
    redirect_to catalogue_reviews_path, notice: t("plants.review.flash.accepted", name: @species.latin_name), status: :see_other
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique
    redirect_to catalogue_reviews_path, alert: t("plants.review.flash.invalid", name: review_params[:latin_name]), status: :see_other
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

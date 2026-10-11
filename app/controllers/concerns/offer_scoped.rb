# The offer builder is for the members of the team a map belongs to: they
# price the work, the client never sees this. Loads @map (MapScoped) and
# @offer (the saved one, or a new one prefilled from the map).
module OfferScoped
  extend ActiveSupport::Concern
  include MapScoped

  included do
    before_action :set_map
    before_action :require_team_member!, unless: -> { request.format.html? && action_name == "show" && controller_name == "offers" }
    before_action :set_offer
  end

  private
    def team_member? = @map.organization&.member?(Current.user) || false

    def require_team_member!
      return if team_member?
      respond_to do |format|
        format.json { render json: { message: t("offers.errors.team_only") }, status: :forbidden }
        format.any { redirect_to map_offer_path(@map) }
      end
    end

    def set_offer
      @offer = @map.offer || Offer.build_for(@map) if team_member?
    end

    def offer_json(offer = @offer)
      {
        inputs: offer.inputs, lockVersion: offer.lock_version, persisted: offer.persisted?,
        updatedAt: offer.updated_at&.iso8601, updatedBy: offer.updated_by&.display_name
      }
    end

    def measures_json(offer = @offer)
      offer.measures.to_h.merge("candidates" => offer.measures.candidates)
    end

    def versions_json(offer = @offer)
      offer.versions.includes(:created_by).map { version_json(_1) }
    end

    def version_json(version)
      {
        number: version.number, label: version.label, status: version.status, note: version.note,
        createdAt: version.created_at.iso8601, createdBy: version.created_by&.display_name,
        totalTvac: version.result.dig("totals", "total_tvac"), totalMaxTvac: version.result.dig("totals", "total_max_tvac")
      }
    end
end

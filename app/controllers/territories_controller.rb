# « Territoires »: Terranova at the scale of a commune, for the teams Semisto
# granted the module to (Admin::TeamsController). A member opens a territory
# by the commune's name (Providers::CommuneBoundaries), reads it on the map
# with the region's layers and gathers its dossier (Territories::ItemsController),
# then prints the « carnet du territoire » (#notebook).
class TerritoriesController < ApplicationController
  include TerritoryScoped

  before_action :set_territory, only: %i[show update archive unarchive notebook]
  before_action :require_territory_editor!, only: %i[update archive]

  def index
    territories = Territory.visible_to(Current.user).includes(:organization).order(updated_at: :desc).to_a
    render inertia: "territories/index", props: {
      territories: territories.map { |territory| summary(territory) },
      teams: granted_teams.map { |team| { id: team.id, name: team.name } },
      communesAvailable: communes.available?
    }
  end

  # The communes whose name matches, for « Nouveau territoire ».
  def communes_search
    return render(json: { message: t("territories.errors.module_off") }, status: :forbidden) if granted_teams.empty?
    candidates = communes.search(params[:q], countries: Region.active.where.not(country_code: nil).distinct.pluck(:country_code))
    render json: { communes: candidates.map(&:as_json) }
  rescue Providers::CommuneBoundaries::Unavailable
    render json: { message: t("territories.errors.communes_unavailable") }, status: :service_unavailable
  end

  def create
    team = granted_teams.find { |t| t.id == params[:team_id].to_i }
    return redirect_to(territories_path, alert: t("territories.errors.module_off"), status: :see_other) unless team
    boundary = communes.fetch(params[:commune_id])
    territory = team.territories.new(
      name: params[:name].presence || boundary.name, boundary: boundary.geometry, created_by: Current.user,
      boundary_source: { provider: boundary.provider, id: boundary.id, label: [ boundary.name, boundary.detail ].compact.join(", "), licence: boundary.licence }
    )
    if territory.save
      redirect_to territory_path(territory), notice: t("territories.flash.created", name: territory.name), status: :see_other
    else
      redirect_to territories_path, alert: territory.errors.full_messages.to_sentence, status: :see_other
    end
  rescue Providers::CommuneBoundaries::NotFound
    redirect_to territories_path, alert: t("territories.errors.commune_not_found"), status: :see_other
  rescue Providers::CommuneBoundaries::Unavailable
    redirect_to territories_path, alert: t("territories.errors.communes_unavailable"), status: :see_other
  end

  def show
    items = @territory.items.not_rejected.with_attached_file.order(:created_at).to_a
    render inertia: "territories/show", props: {
      territory: @territory.as_inertia,
      items: items.map(&:as_inertia),
      layers: @territory.readable_layers.map(&:as_inertia),
      teamMaps: @territory.team_maps.map { |map| { id: map.id, name: map.name, boundary: map.geometry_geojson(:boundary), areaM2: map.area_m2 } },
      researchGrid: @territory.research_grid,
      canEdit: @territory.editable_by?(Current.user),
      moduleGranted: @territory.organization.territory_module?
    }
  end

  def update
    attrs = {}
    attrs[:name] = params[:name] if params.key?(:name)
    if params[:notebook].respond_to?(:to_unsafe_h) || params[:notebook].is_a?(Hash)
      given = params.require(:notebook).permit(:intro, :next_step, :next_step_budget).to_h
      attrs[:notebook] = @territory.notebook.merge(given.transform_values { |v| v.to_s.strip.first(TerritoryItem::BODY_MAX_LENGTH) })
    end
    if @territory.update(attrs)
      redirect_back_or_to territory_path(@territory), notice: t("territories.flash.saved"), status: :see_other
    else
      redirect_back_or_to territory_path(@territory), alert: @territory.errors.full_messages.to_sentence, status: :see_other
    end
  end

  def archive
    @territory.archive!
    redirect_to territories_path, notice: t("territories.flash.archived", name: @territory.name), status: :see_other
  end

  def unarchive
    return head(:not_found) unless @territory.organization.territory_module?
    @territory.unarchive!
    redirect_to territory_path(@territory), notice: t("territories.flash.unarchived", name: @territory.name), status: :see_other
  end

  # The « carnet du territoire »: ?version=public leaves out what must not
  # leave the collège (hypotheses, outlines on private land).
  def notebook
    version = params[:version] == "public" ? "public" : "working"
    render inertia: "territories/notebook", props: TerritoryNotebook.new(@territory, version:).as_inertia.merge(
      canEdit: @territory.editable_by?(Current.user),
      baseLayer: @territory.readable_layers.find { |layer| layer.category == "base" && layer.kind == "style" }&.as_inertia
    )
  end

  private
    def granted_teams
      @granted_teams ||= Organization.where(id: OrganizationMembership.where(user: Current.user).select(:organization_id))
                                     .where.not(territory_module_granted_at: nil).order(:name).to_a
    end

    def communes = @communes ||= Providers::CommuneBoundaries.build

    def summary(territory)
      {
        id: territory.id, name: territory.name, teamName: territory.organization.name, areaM2: territory.area_m2.round,
        boundary: territory.geometry_geojson(:boundary), archived: territory.archived?, updatedAt: territory.updated_at.iso8601,
        counts: territory.counts
      }
    end
end

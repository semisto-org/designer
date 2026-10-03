class MapsController < ApplicationController
  include MapScoped

  before_action :set_map, only: %i[show update destroy]
  before_action :require_editor!, only: :update
  before_action :require_owner!, only: :destroy

  def index
    maps = Map.active.where(id: Current.user.map_memberships.select(:map_id))
      .or(Map.active.where(organization_id: Current.user.organization_memberships.select(:organization_id)))
      .includes(:region, :owner).order(updated_at: :desc)
    render inertia: "maps/index", props: {
      maps: maps.map { |m| m.as_inertia(Current.user) },
      canCreate: Current.user.entitlements.can_create_map?(Current.user)
    }
  end

  def new
    region = Region.default
    render inertia: "maps/new", props: { region: region.as_inertia, layers: region.layers.enabled.bases.map(&:as_inertia) }
  end

  def create
    unless Current.user.entitlements.can_create_map?(Current.user)
      return redirect_to maps_path, alert: t("maps.errors.plan_limit")
    end
    map = Current.user.owned_maps.new(map_params)
    map.region ||= Region.default
    if map.save
      # `next`: what the editor starts with (pick parcels, draw, import).
      redirect_to map_path(map, terrain: params[:next].presence_in(%w[parcels draw import])), notice: t("maps.created")
    else
      redirect_to new_map_path, inertia: { errors: map.errors }
    end
  end

  def show
    render inertia: "maps/show", props: {
      map: @map.as_inertia(Current.user).merge(readOnlyByPlan: @map.read_only_by_plan?),
      layers: @map.region.layers.enabled.map(&:as_inertia),
      features: @map.features.where.not(status: "rejected").map(&:as_geojson),
      mapEntitlements: map_entitlements.as_json
    }
  end

  def update
    if @map.update(map_params)
      respond_to do |format|
        format.json { render json: { map: @map.as_inertia(Current.user) } }
        format.any { redirect_to map_path(@map), notice: t("maps.updated") }
      end
    else
      respond_to do |format|
        format.json { render_errors @map }
        format.any { redirect_to map_path(@map), inertia: { errors: @map.errors } }
      end
    end
  end

  def destroy
    @map.update!(archived_at: Time.current)
    redirect_to maps_path, notice: t("maps.archived"), status: :see_other
  end

  private
    def map_params
      permitted = params.require(:map).permit(:name, :description, :address, :stage, :zoom, :lock_version, parcels: [])
      permitted[:boundary] = params[:map][:boundary] if params[:map].key?(:boundary)
      permitted[:center] = point_from(params[:map][:center]) if params[:map][:center].present?
      permitted
    end

    def point_from(coords)
      lng, lat = Array(coords).map(&:to_f)
      GeoJsonGeometry::FACTORY.point(lng, lat)
    end
end

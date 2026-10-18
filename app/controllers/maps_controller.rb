class MapsController < ApplicationController
  include MapScoped

  before_action :set_map, only: %i[show update destroy]
  before_action :require_editor!, only: :update
  before_action :require_owner!, only: :destroy

  def index
    # A new account first says who it designs for (welcome page).
    return redirect_to welcome_path if request.format.html? && !Current.user.account_kind_chosen? && !impersonating?

    maps = Map.active.where(id: Current.user.map_memberships.select(:map_id))
      .or(Map.active.where(organization_id: Current.user.organization_memberships.select(:organization_id)))
      .includes(:region, :owner).order(updated_at: :desc)
    maps = maps.to_a
    sketch = MapSketch.new(maps)
    sketches = sketch.as_json
    roles = listed_roles(maps)
    render inertia: "maps/index", props: {
      # teamId + teams: team maps are listed in a section per team (teams area).
      # sketch: what the card paints of the terrain (MapSketch), with its
      # outline simplified by PostGIS.
      maps: maps.map do |m|
        outline = sketch.outlines[m.id]
        m.as_inertia(Current.user, role: roles[m.id], boundary: outline&.dig(:boundary), bbox: outline&.dig(:bbox))
          .merge(teamId: m.organization_id, sketch: sketches[m.id])
      end,
      # The map worked on last opens large, with its next step (journey).
      resume: maps.first && { mapId: maps.first.id, next: Journey.new(maps.first).next_action },
      canCreate: Current.user.entitlements.can_create_map?(Current.user),
      teams: Current.user.organizations.order(:name, :id).map { |team| { id: team.id, name: team.name } },
      # My archived maps, at the bottom: readable, and brought back when the plan has room.
      archivedMaps: archived_maps_json,
      # Ownership transfers waiting for my answer (transfer area).
      incomingTransfers: MapTransfer.incoming_for(Current.user).map(&:as_incoming_json)
    }
  end

  def new
    region = Region.europe || Region.default
    render inertia: "maps/new", props: { region: region.as_inertia, layers: region.catalogue.enabled.bases.map(&:as_inertia) }
  end

  def create
    unless Current.user.entitlements.can_create_map?(Current.user)
      return redirect_to maps_path, alert: t("maps.errors.plan_limit")
    end
    map = Current.user.owned_maps.new(map_params)
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
      layers: @map.region.catalogue.enabled.map(&:as_inertia),
      features: @map.features.where.not(status: "rejected").map(&:as_geojson),
      mapEntitlements: map_entitlements.as_json,
      # Dated drone views, newest first (« Couches », with the base maps),
      # and for editors the ones imported from a file, to follow them.
      aerialViews: @map.aerial_views.ready.map { _1.as_inertia(archive_url: archive_map_aerial_view_path(@map, _1)) },
      aerialImports: %w[owner editor].include?(@role) ? @map.aerial_views.imported.includes(:created_by).map { _1.as_inertia(archive_url: archive_map_aerial_view_path(@map, _1)) } : [],
      # Sketches and plans laid under the drawing (« Fonds de plan »).
      planImages: @map.plan_images.with_attached_image.map(&:as_inertia),
      # The « carnet de route » ends on Claude: already plugged in, or how to.
      aiConnected: Current.user.ai_connected?,
      # The « Offre » panel: for teams and professional accounts only.
      offerBuilder: Offer.shown_to?(@map, Current.user)
    }
  end

  def update
    # Editors shape the map; only its owner renames it.
    return require_owner! if renaming? && @role != "owner"

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

  # Archives the map (Maps::ArchivesController does the same, and brings it back).
  def destroy
    @map.archive!
    redirect_to maps_path, notice: t("maps.archived"), status: :see_other
  end

  private
    def renaming?
      params[:map].respond_to?(:key?) && params[:map].key?(:name) && params[:map][:name].to_s.strip != @map.name
    end

    # Map#role_for for a whole list, in two queries instead of two a map.
    def archived_maps_json
      Current.user.owned_maps.where.not(archived_at: nil).includes(organization: :billing_user).order(archived_at: :desc).limit(200).map do |map|
        { id: map.id, name: map.name, archivedAt: map.archived_at.iso8601, teamId: map.organization_id, canRestore: map.unarchivable? }
      end
    end

    def listed_roles(maps)
      user = Current.user
      team_ids = user.organization_memberships.pluck(:organization_id).to_set
      member_roles = user.map_memberships.where(map_id: maps.map(&:id)).pluck(:map_id, :role).to_h
      maps.to_h do |map|
        role = if map.owner_id == user.id then "owner"
        elsif map.organization_id && team_ids.include?(map.organization_id) then "editor"
        else member_roles[map.id]
        end
        [ map.id, role || map.role_for(user) ]
      end
    end

    def map_params
      permitted = params.require(:map).permit(:name, :description, :address, :stage, :zoom, :lock_version, parcels: [])
      if params[:map].key?(:boundary)
        # GeoJSON is free-form: hand the model a plain hash, never nested Parameters
        # (mass assignment would raise UnfilteredParameters on them).
        boundary = params[:map][:boundary]
        permitted[:boundary] = boundary.respond_to?(:to_unsafe_h) ? boundary.to_unsafe_h : boundary
      end
      permitted[:center] = point_from(params[:map][:center]) if params[:map][:center].present?
      permitted
    end

    def point_from(coords)
      lng, lat = Array(coords).map(&:to_f)
      GeoJsonGeometry::FACTORY.point(lng, lat)
    end
end

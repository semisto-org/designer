# The quick switcher (Cmd+J / Ctrl+J, anywhere in the app). `index`: every
# map the person can open, light enough to fetch on each opening and filter
# in the browser as they type. `show`: the preview of the chosen one (its
# terrain sketch and next step), fetched as the selection moves.
class QuickSwitcherController < ApplicationController
  def index
    team_ids = Current.user.organization_memberships.pluck(:organization_id)
    member_roles = Current.user.map_memberships.pluck(:map_id, :role).to_h
    teams = Organization.where(id: team_ids).pluck(:id, :name).to_h
    maps = Map.active.where(id: member_roles.keys).or(Map.active.where(organization_id: team_ids))
      .order(updated_at: :desc)
      .pluck(:id, :name, :address, :stage, :owner_id, :organization_id, :updated_at)

    render json: {
      maps: maps.map do |id, name, address, stage, owner_id, organization_id, updated_at|
        role = if owner_id == Current.user.id then "owner"
        elsif organization_id && teams.key?(organization_id) then "editor"
        else member_roles[id]
        end
        { id:, name:, address:, stage:, role:, teamName: teams[organization_id], updatedAt: updated_at.iso8601 }
      end
    }
  end

  def show
    map = Map.active.includes(:region, :owner).find_by(id: params[:id])
    return head :not_found unless map&.viewable_by?(Current.user)

    sketch = MapSketch.new([ map ])
    outline = sketch.outlines[map.id]
    render json: {
      map: map.as_inertia(Current.user, boundary: outline&.dig(:boundary), bbox: outline&.dig(:bbox)).merge(sketch: sketch.as_json[map.id]),
      next: Journey.new(map).next_action
    }
  end
end

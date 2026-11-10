module Mcp
  module Tools
    # Finds a territory (« Territoire », a commune read whole) for the tools
    # that work on one: the user must belong to its team.
    module TerritoryAccess
      private
        def find_territory!(id)
          territory = Territory.visible_to(user).includes(:organization, :region).find_by(id:)
          raise ToolError, t("errors.territory_not_found", id:) unless territory
          @territory = territory
        end

        def require_territory_editor!(territory)
          return if territory.editable_by?(user)
          raise ToolError, t(territory.archived? ? "errors.territory_archived" : "errors.territory_module_off")
        end

        def territory_url(territory) = "#{origin}/territories/#{territory.id}"

        def item_json(item)
          {
            id: item.id, kind: item.kind, status: item.status, source: item.source,
            title: item.title, body: item.body, rationale: item.rationale,
            geometry: item.geometry && Geo.encode(item.geometry),
            properties: item.properties,
            file: item.file.attached? ? item.file.filename.to_s : nil,
            orphan: (item.orphan? if item.kind == "lead"),
            sharp: (item.sharp? if item.kind == "lead"),
            waiting_for_farmer: (true if item.waiting_for_farmer?)
          }.compact
        end
    end
  end
end

module Mcp
  module Tools
    # Whose « charte graphique » a tool reads or proposes: the connected
    # person's own (pro account), or one of their teams' (team_id).
    module DocumentThemeAccess
      private
        def theme_holder!(team_id)
          return user unless team_id
          team = Organization.find_by(id: team_id)
          raise ToolError, t("errors.team_not_found", id: team_id) unless team&.membership_for(user)
          team
        end

        def theme_url(holder)
          holder.is_a?(Organization) ? "#{origin}/teams/#{holder.id}/charte" : "#{origin}/account/charte"
        end

        def theme_fields(values)
          values.slice(*DocumentTheme::FIELDS)
        end
    end
  end
end

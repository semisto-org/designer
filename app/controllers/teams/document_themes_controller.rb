# /teams/:id/charte — the charter of a team's documents (DocumentThemeActions):
# every member sees it, admins change it.
module Teams
  class DocumentThemesController < ApplicationController
    include TeamScoped
    include DocumentThemeActions

    before_action :set_team
    before_action :require_team_admin!, only: %i[update accept_draft reject_draft]

    private
      def theme_holder = @team
      def theme_editable? = team_admin?
      def theme_path = team_document_theme_path(@team)

      def holder_props
        { kind: "team", name: @team.name, logoUrl: @team.logo_url, logoEndpoint: "/teams/#{@team.id}/logo", logoParam: "team",
          endpoint: theme_path, back: team_path(@team) }
      end
  end
end

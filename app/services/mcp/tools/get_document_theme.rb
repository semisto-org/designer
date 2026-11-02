module Mcp
  module Tools
    # The « charte graphique » of the connected person's documents, or of one
    # of their teams: colours, fonts, footer, logo and cover image, the fonts
    # it may choose, Semisto's charter that fills what is left empty, and the
    # proposal not reviewed yet. Read before propose_document_theme.
    class GetDocumentTheme < Base
      include DocumentThemeAccess

      arguments(properties: { team_id: { type: "integer", minimum: 1, description: :theme_team_id } })
      hints

      def perform(team_id: nil)
        holder = theme_holder!(team_id)
        theme = holder.document_theme_object
        draft = holder.document_theme_draft
        {
          owner: { kind: holder.is_a?(Organization) ? "team" : "account", id: holder.id, name: theme.name },
          applies: theme_fields(theme.values), own: theme.own, semisto_defaults: DocumentTheme::DEFAULTS,
          logo: holder.logo_url && "#{origin}#{holder.logo_url}", cover_image: holder.document_cover_url && "#{origin}#{holder.document_cover_url}",
          fonts: DocumentTheme::FONTS.map { |key, (_, name, kind)| { key:, name:, kind: } },
          pending_proposal: draft && { fields: draft["theme"], rationale: draft["rationale"], proposed_at: draft["proposed_at"] },
          can_change: holder.is_a?(Organization) ? holder.admin?(user) : true,
          teams: user.organizations.order(:name).map { |team| { id: team.id, name: team.name } },
          url: theme_url(holder)
        }.compact
      end
    end
  end
end

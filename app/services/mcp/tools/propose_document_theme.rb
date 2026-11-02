module Mcp
  module Tools
    # Proposes a « charte graphique » for the connected person's documents
    # or one of their teams', typically read from their design system:
    # colours, fonts from the list, footer. A draft: it waits on the
    # « Charte graphique » page, beside the charter in place, until someone
    # who may change it takes it or refuses it. A new proposal replaces the
    # one not reviewed yet.
    class ProposeDocumentTheme < Base
      include DocumentThemeAccess

      requirement :propose
      COLOR = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" }.freeze
      arguments(
        properties: {
          team_id: { type: "integer", minimum: 1, description: :theme_team_id },
          heading_color: COLOR.merge(description: :theme_heading_color),
          accent_color: COLOR.merge(description: :theme_accent_color),
          text_color: COLOR.merge(description: :theme_text_color),
          heading_font: { type: "string", enum: DocumentTheme::FONTS.keys, description: :theme_heading_font },
          body_font: { type: "string", enum: DocumentTheme::FONTS.keys, description: :theme_body_font },
          footer: { type: "string", maxLength: DocumentTheme::MAX_FOOTER, description: :theme_footer },
          rationale: { type: "string", minLength: 10, maxLength: 2000, description: :theme_rationale }
        },
        required: %w[rationale]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(rationale:, team_id: nil, **fields)
        require_drafts_scope!
        holder = theme_holder!(team_id)
        theme = DocumentTheme.normalize(fields)
        raise ToolError, t("errors.theme_empty") if theme.empty?

        holder.update!(document_theme_draft: {
          "theme" => theme, "rationale" => rationale, "client_name" => principal.client_name, "proposed_at" => Time.current.iso8601
        })
        { proposed: theme, review_url: theme_url(holder), next_step: t("notes.review_document_theme") }
      end

      private
        def summarize_arguments(arguments)
          arguments.slice(:team_id, *DocumentTheme::FIELDS.map(&:to_sym)).merge(rationale: arguments[:rationale].to_s.first(200))
        end

        def summarize_result(data) = { fields: data[:proposed].keys }
    end
  end
end

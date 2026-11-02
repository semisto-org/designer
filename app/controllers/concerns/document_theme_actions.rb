# The « Charte graphique » page of a pro account (/account/charte) or a team
# (/teams/:id/charte): the logo, the colours, fonts, cover image and footer
# of its documents (DocumentTheme), and the charter its AI proposed through
# the MCP (propose_document_theme), taken or refused here.
module DocumentThemeActions
  extend ActiveSupport::Concern

  def show
    theme = theme_holder.document_theme_object
    render inertia: "document_themes/show", props: {
      holder: holder_props,
      theme: theme.as_json,
      own: theme.own,
      defaults: DocumentTheme::DEFAULTS,
      fonts: DocumentTheme.fonts_json,
      draft: draft_props,
      canEdit: theme_editable?
    }
  end

  def update
    holder = theme_holder
    # A field equal to Semisto's is not kept: it follows Semisto's charter.
    holder.document_theme = DocumentTheme.normalize(params.fetch(:theme, {}).permit(*DocumentTheme::FIELDS)).reject { |field, value| DocumentTheme::DEFAULTS[field] == value }
    cover = params.dig(:theme, :cover)
    holder.document_cover = cover if cover.is_a?(ActionDispatch::Http::UploadedFile)
    holder.document_cover.purge if params.dig(:theme, :remove_cover).to_s == "true" && holder.document_cover.attached?
    if holder.save
      redirect_to theme_path, notice: t("document_themes.saved"), status: :see_other
    else
      redirect_to theme_path, inertia: { errors: { cover: holder.errors[:document_cover].first || holder.errors.full_messages.first } }, status: :see_other
    end
  end

  def accept_draft
    theme_holder.accept_document_theme_draft!
    redirect_to theme_path, notice: t("document_themes.draft.accepted"), status: :see_other
  end

  def reject_draft
    theme_holder.update!(document_theme_draft: nil)
    redirect_to theme_path, notice: t("document_themes.draft.rejected"), status: :see_other
  end

  private
    def draft_props
      draft = theme_holder.document_theme_draft or return nil
      preview = DocumentTheme.new(theme_holder, overlay: draft["theme"])
      { theme: preview.as_json, fields: draft["theme"], rationale: draft["rationale"], clientName: draft["client_name"], proposedAt: draft["proposed_at"] }
    end
end

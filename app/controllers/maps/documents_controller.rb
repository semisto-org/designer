# The map's « Documents » library: a full page and its JSON. Everyone on the
# map reads and downloads; editors add, rename, tag and remove. Documents
# sent with the project sheet (by the team or through its private link)
# live here too. A Markdown document opens as a page of its own (show),
# read by everyone, written in place by editors (content).
module Maps
  class DocumentsController < ApplicationController
    include MapScoped
    include ServesMapDocuments

    before_action :set_map
    before_action :require_editor!, except: %i[index show file content]
    before_action :set_document, only: %i[show update destroy file content update_content]
    before_action :require_markdown!, only: %i[show content update_content]

    def index
      respond_to do |format|
        format.html do
          render inertia: "maps/documents/index", props: {
            map: @map.as_inertia(Current.user).slice(:id, :name, :areaM2, :role, :teamId)
              .merge(offerBuilder: Offer.shown_to?(@map, Current.user)),
            documents: documents_json,
            canEdit: editor?,
            limits: document_limits
          }
        end
        format.json { render json: { documents: documents_json, limits: document_limits } }
      end
    end

    # A Markdown page: read like a page of the notebook, edited in place,
    # printed (or saved as PDF) under the team's or the pro's logo.
    def show
      render inertia: "maps/documents/show", props: {
        map: { id: @map.id, name: @map.name },
        document: as_json(@document),
        content: @document.markdown_content,
        checksum: @document.content_checksum,
        canEdit: editor?,
        letterhead: @map.letterhead
      }
    end

    def create
      return create_markdown if params.dig(:document, :markdown).present?
      document = @map.documents.new(document_params.merge(uploaded_by: Current.user, origin: origin_param))
      document.save ? render(json: as_json(document), status: :created) : render_document_errors(document)
    end

    def content
      render json: { content: @document.markdown_content, checksum: @document.content_checksum }
    end

    # Saves the editor's text. `base` is the checksum it read: when the text
    # changed meanwhile, nothing is written and the current text comes back.
    def update_content
      text = params.require(:content).to_s
      if text.bytesize > MapDocument::MAX_MARKDOWN_BYTES
        return render json: { message: t("documents.markdown.errors.too_long") }, status: :unprocessable_entity
      end
      @document.replace_markdown!(text, by: Current.user, base: params[:base].presence)
      render json: { document: as_json(@document.reload), checksum: @document.content_checksum }
    rescue MapDocument::StaleContent
      @document.reload
      render json: {
        message: t("documents.markdown.errors.stale", name: @document.content_edited_by&.display_name || t("documents.markdown.someone")),
        content: @document.markdown_content, checksum: @document.content_checksum, document: as_json(@document)
      }, status: :conflict
    end

    def update
      @document.update(document_params(%i[title description])) ? render(json: as_json(@document)) : render_document_errors(@document)
    end

    def destroy
      @document.destroy!
      head :no_content
    end

    # /maps/:map_id/documents/:id/file?size=thumb|large|original|download
    def file
      serve_document(@document)
    end

    private
      def editor? = %w[owner editor].include?(@role)

      def set_document
        @document = @map.documents.find(params[:id])
      end

      def require_markdown!
        return if @document.editable_markdown?
        respond_to do |format|
          format.html { redirect_to map_documents_path(@map, open: @document.id) }
          format.json { render json: { message: t("documents.markdown.errors.not_markdown") }, status: :unprocessable_entity }
        end
      end

      def create_markdown
        raw = params.require(:document).permit(:title, :content, tags: [])
        title = raw[:title].to_s.squish.presence || t("documents.markdown.untitled")
        document = MapDocument.build_markdown(map: @map, title:, content: raw[:content].to_s, by: Current.user, tags: Array(raw[:tags]))
        document.save ? render(json: as_json(document), status: :created) : render_document_errors(document)
      end

      def origin_param
        params.dig(:document, :origin).presence_in(MapDocument::ORIGINS) || "library"
      end

      def documents_json
        @map.documents.newest_first.includes(:uploaded_by, :content_edited_by, { form_response: :form }, file_attachment: :blob, thumbnail_attachment: :blob).map { as_json(_1) }
      end

      def as_json(document)
        document.as_inertia(url: ->(doc, size) { file_map_document_path(@map, doc, size:) })
      end
  end
end

module Mcp
  module Tools
    # What the document tools share: a document of the library as the AI
    # reads it, and what this connection may do with the library.
    module DocumentHelpers
      private
        def document_json(document)
          blob = document.file.attached? ? document.file.blob : nil
          {
            id: document.id, title: document.title, description: document.description, tags: document.tags.presence,
            kind: document.kind, filename: blob&.filename&.to_s, content_type: blob&.content_type, byte_size: blob&.byte_size,
            readable: DocumentReader.readable?(document),
            from_project_sheet: document.origin == "project_sheet" || nil,
            form_answer: document.origin == "form" || nil,
            uploaded_by: document.uploaded_by&.display_name || (document.project_sheet_link_id && t("notes.project_link_author")),
            created_at: document.created_at.iso8601, updated_at: document.updated_at.iso8601
          }.compact
        end

        def find_document!(map, id)
          map.documents.includes(:uploaded_by, file_attachment: :blob).find_by(id:) or
            raise ToolError, t("errors.document_not_found", id:)
        end

        def documents_url(map) = "#{map_url(map)}/documents"

        def save_document!(document)
          return if document.save
          raise ToolError, t("errors.document_invalid", details: document.errors.full_messages.to_sentence)
        end
    end
  end
end

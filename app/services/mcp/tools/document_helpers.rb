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
            in_discussion_only: !document.in_library? || nil,
            convertible_to_pdf: document.convertible_to_pdf? || nil,
            pdf_conversion: document.pdf_conversion_state,
            pdf_document_id: (document.pdf_copy&.id if OfficePdf.convertible?(document.extension)),
            converted_from_id: document.converted_from_id,
            uploaded_by: document.uploaded_by&.display_name || (document.project_sheet_link_id && t("notes.project_link_author")),
            created_at: document.created_at.iso8601, updated_at: document.updated_at.iso8601
          }.compact
        end

        # `discussion: true` also finds a document joined to a message of the
        # discussion (not in the library), for the discussion's members.
        def find_document!(map, id, discussion: false)
          scope = discussion && map.chat_member?(user) ? map.all_documents : map.documents
          scope.includes(:uploaded_by, file_attachment: :blob).find_by(id:) or
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

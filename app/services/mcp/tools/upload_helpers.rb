module Mcp
  module Tools
    # What attach_photos and attach_documents share: finding the upload a
    # signed_id names, for this map, once.
    module UploadHelpers
      MAX_ATTACH = 50

      private
        # The upload, locked, or FileAttacher::Refused with its code.
        def claim_upload!(map, signed_id)
          blob = ActiveStorage::Blob.find_signed(signed_id)
          upload = blob && McpUpload.find_by(blob_id: blob.id)
          refuse!("unknown_upload", t("upload_errors.unknown")) unless upload
          upload.lock!
          refuse!("other_map", t("upload_errors.other_map", map_id: upload.map_id)) if upload.map_id != map.id
          refuse!("not_yours", t("upload_errors.not_yours")) if upload.user_id != user.id
          refuse!("already_attached", t("upload_errors.already_attached")) if upload.attached?
          refuse!("not_received", t("upload_errors.not_received")) unless upload.received?
          upload
        end

        def refuse!(code, message) = raise(FileAttacher::Refused.new(code, message))

        def attacher(map) = FileAttacher.new(map:, user:)

        # Runs each line in its own transaction; a refused line comes back
        # with its code, the others go through.
        def each_line(lines)
          done = []
          rejected = []
          lines.each_with_index do |line, index|
            line = line.to_h.transform_keys(&:to_s)
            ActiveRecord::Base.transaction { done << yield(line) }
          rescue FileAttacher::Refused => e
            rejected << { index:, signed_id: line["signed_id"]&.first(40), code: e.code, error: e.message }
          rescue PhotoHelpers::Invalid => e
            rejected << { index:, signed_id: line["signed_id"]&.first(40), code: "invalid", error: e.message }
          end
          if done.empty?
            raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} (#{r[:code]}) : #{r[:error]}" }.join(" ; "))
          end
          [ done, rejected ]
        end
    end
  end
end

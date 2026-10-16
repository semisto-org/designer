module Mcp
  # PUT /mcp/uploads/:token/parts/:number: one part of a large file an AI
  # sends after create_upload (McpUpload#part_size bytes, the last one
  # less). The signed token names the upload, as the disk service's URL
  # names a blob: no bearer token, so curl only needs the URL. A part sent
  # again replaces the first one. An optional Content-MD5 header is checked.
  class UploadPartsController < ActionController::API
    rate_limit to: 600, within: 1.minute, by: -> { request.remote_ip }, store: AgentApi::RATE_LIMIT_STORE, name: "ip"

    def update
      upload = McpUpload.find_for_part(params[:token])
      return render_error(:not_found, "unknown_upload") unless upload&.multipart?
      return render_error(:conflict, "already_attached") if upload.attached?
      number = Integer(params[:number], exception: false).to_i
      expected = upload.part_byte_size(number)
      return render_error(:not_found, "unknown_part", parts: upload.part_count) unless expected
      if request.content_length != expected
        return render_error(:unprocessable_content, "wrong_size", expected:, received: request.content_length)
      end
      upload.store_part(number, request.body, checksum: request.headers["Content-MD5"].presence)
      head :no_content
    rescue ActiveStorage::IntegrityError
      upload.blob.service.delete(upload.part_key(number))
      render_error(:unprocessable_content, "checksum_mismatch")
    end

    private
      def render_error(status, code, **details)
        render status:, json: { error: code, **details }
      end
  end
end

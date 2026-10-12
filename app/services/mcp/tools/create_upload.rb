module Mcp
  module Tools
    # Prepares files the AI sends itself, outside the MCP call: for each, a
    # signed URL to PUT the bytes to (ActiveStorage direct upload), valid
    # McpUpload::URL_LIFETIME, then attach_photos or attach_documents with
    # its signed_id. The bytes never go through the conversation.
    class CreateUpload < Base
      MAX_FILES = 50
      CHECKSUM = %r{\A[A-Za-z0-9+/]{22}==\z}

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          files: {
            type: "array", minItems: 1, maxItems: MAX_FILES, description: :upload_files,
            items: {
              type: "object", additionalProperties: false, required: %w[kind filename byte_size checksum content_type],
              properties: {
                kind: { type: "string", enum: McpUpload::KINDS, description: :upload_kind },
                filename: { type: "string", minLength: 1, maxLength: 255, description: :upload_filename },
                byte_size: { type: "integer", minimum: 1, description: :byte_size },
                checksum: { type: "string", minLength: 24, maxLength: 24, description: :checksum },
                content_type: { type: "string", minLength: 3, maxLength: 255, description: :content_type }
              }
            }
          }
        },
        required: %w[map_id files]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, files:)
        map = find_map!(map_id)
        require_write!(map)
        uploads = []
        rejected = []
        ActiveStorage::Current.set(url_options:) do
          files.each_with_index do |line, index|
            line = line.to_h.transform_keys(&:to_s)
            if (code, message = refusal(line))
              rejected << { index:, filename: line["filename"], code:, error: message }
              next
            end
            uploads << prepare(map, index, line)
          end
        end
        raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} (#{r[:code]}) : #{r[:error]}" }.join(" ; ")) if uploads.empty?
        {
          uploads:, rejected:,
          expires_at: McpUpload::URL_LIFETIME.from_now.iso8601,
          next_step: t("notes.upload_next", minutes: McpUpload::URL_LIFETIME.in_minutes.to_i)
        }
      end

      private
        # [code, message] when the file cannot be accepted, before any byte is sent.
        def refusal(line)
          name = line["filename"]
          return [ "invalid_checksum", t("upload_errors.checksum", name:) ] unless line["checksum"].match?(CHECKSUM)
          if line["kind"] == "photo"
            return [ "unsupported_type", t("upload_errors.photo_type", name:) ] unless MapPhoto::UPLOAD_TYPES.include?(line["content_type"].downcase)
            return [ "too_large", t("upload_errors.too_large", name:, max: MapPhoto::MAX_BYTES / 1.megabyte) ] if line["byte_size"] > MapPhoto::MAX_BYTES
          else
            ext = File.extname(name).delete(".").downcase
            return [ "unsupported_type", t("upload_errors.document_type", name:) ] unless MapDocument::EXTENSIONS.include?(ext)
            return [ "too_large", t("upload_errors.too_large", name:, max: MapDocument::MAX_BYTES / 1.megabyte) ] if line["byte_size"] > MapDocument::MAX_BYTES
          end
          nil
        end

        def prepare(map, index, line)
          blob = ActiveStorage::Blob.create_before_direct_upload!(
            filename: line["filename"], byte_size: line["byte_size"], checksum: line["checksum"],
            content_type: line["content_type"].downcase
          )
          McpUpload.create!(blob:, map:, user:, kind: line["kind"])
          url = blob.service_url_for_direct_upload(expires_in: McpUpload::URL_LIFETIME)
          headers = blob.service_headers_for_direct_upload
          {
            index:, filename: line["filename"], kind: line["kind"], signed_id: blob.signed_id,
            upload_url: url, method: "PUT", headers:,
            curl: curl(url, headers, line["filename"])
          }
        end

        def curl(url, headers, filename)
          parts = [ "curl", "--fail", "-X", "PUT", "--data-binary", "@#{filename}" ]
          headers.each { |name, value| parts.push("-H", "#{name}: #{value}") }
          parts.push(url)
          Shellwords.join(parts)
        end

        # Disk storage builds its upload URL from the current request's host.
        def url_options
          uri = URI(origin)
          { protocol: uri.scheme, host: uri.host, port: uri.port }
        end

        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], files: Array(arguments[:files]).size, bytes: Array(arguments[:files]).sum { _1[:byte_size].to_i } }
        end

        def summarize_result(data) = { prepared: data[:uploads].size, rejected: data[:rejected].size }
    end
  end
end

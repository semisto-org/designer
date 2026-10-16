module Mcp
  module Tools
    # Like attach_photos and attach_documents, for a file that is not on the
    # AI's machine: the server fetches it from its HTTPS address (a public
    # Drive file, a share link…), then files it the same way.
    class ImportFromUrl < Base
      include PhotoHelpers
      include DocumentHelpers
      include UploadHelpers

      MAX_FILES = 10

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          files: {
            type: "array", minItems: 1, maxItems: MAX_FILES, description: :import_files,
            items: {
              type: "object", additionalProperties: false, required: %w[url kind],
              properties: {
                url: { type: "string", minLength: 12, maxLength: 2000, description: :import_url },
                kind: { type: "string", enum: McpUpload::KINDS, description: :upload_kind },
                title: { type: "string", minLength: 1, maxLength: 200, description: :document_title },
                description: { type: "string", maxLength: 2000, description: :document_description },
                tags: {
                  type: "array", maxItems: MapFeature::Tags::MAX_TAGS, uniqueItems: true, description: :document_tags,
                  items: { type: "string", minLength: 1, maxLength: MapFeature::Tags::MAX_LENGTH }
                },
                **PhotoHelpers::PLACE_PROPERTIES
              }
            }
          }
        },
        required: %w[map_id files]
      )
      hints(read_only: false, destructive: false, idempotent: false, open_world: true)

      def perform(map_id:, files:)
        map = find_map!(map_id)
        require_write!(map)
        imported, rejected = each_line(files) { |line| import(map, line) }
        map.touch
        {
          imported: imported.map { |record| record.is_a?(MapPhoto) ? photo_json(record.reload).merge(kind: "photo") : document_json(record).merge(kind: "document") },
          rejected:
        }
      end

      private
        def import(map, line)
          # A photo's own limit is checked once its type is known (a video may be larger).
          max = line["kind"] == "photo" ? MapPhoto::VIDEO_MAX_BYTES : MapDocument::MAX_BYTES
          fetched = begin
            RemoteFile.fetch(line["url"], max_bytes: max)
          rescue RemoteFile::Error => e
            refuse!(e.code, t("upload_errors.fetch.#{e.code}", default: t("upload_errors.fetch.other", code: e.code)))
          end
          blob = ActiveStorage::Blob.create_and_upload!(io: fetched.io, filename: fetched.filename, content_type: fetched.content_type, identify: false)
          if line["kind"] == "photo"
            attacher(map).photo(blob) { |record| assign_photo(map, record, line) }
          else
            attacher(map).document(blob, line)
          end
        rescue FileAttacher::Refused
          # The blob's row goes with the transaction; its file must go too.
          blob&.service&.delete(blob.key)
          raise
        ensure
          fetched&.io&.close!
        end

        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], files: Array(arguments[:files]).map { |f| { kind: f[:kind], host: host_of(f[:url]) }.compact } }
        end

        def host_of(url)
          URI.parse(url.to_s).host
        rescue URI::InvalidURIError
          nil
        end

        def summarize_result(data) = { imported: data[:imported].size, rejected: data[:rejected].size }
    end
  end
end

module Mcp
  module Tools
    # Puts documents, photos, videos and soil points in the map's client
    # deliverable (« Livrable client », Pro and Team), or takes them out, as
    # the « Dans le livrable client » box does on each of them. The client
    # sees a marked file at once, at the deliverable's private link (when it
    # is published): the AI does it only when the person asks, after saying
    # which files go to the client. Nothing else changes.
    class MarkForDeliverable < Base
      MAX_ITEMS = 200
      IDS = ->(description) { { type: "array", maxItems: MAX_ITEMS, uniqueItems: true, description:, items: { type: "integer", minimum: 1 } } }

      requirement :write
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          in_deliverable: { type: "boolean", description: :in_deliverable },
          document_ids: IDS.call(:deliverable_document_ids),
          photo_ids: IDS.call(:deliverable_photo_ids),
          soil_sample_ids: IDS.call(:deliverable_soil_sample_ids)
        },
        required: %w[map_id in_deliverable],
        minProperties: 3
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, in_deliverable:, document_ids: [], photo_ids: [], soil_sample_ids: [])
        map = find_map!(map_id)
        require_write!(map)
        raise ToolError, t("errors.deliverable_plan") unless Entitlements.for_map(map).deliverables?
        scopes = {
          documents: [ map.documents, document_ids ],
          photos: [ map.photos, photo_ids ],
          soil_samples: [ map.soil_samples, soil_sample_ids ]
        }
        missing = scopes.to_h { |key, (scope, ids)| [ key, ids - scope.where(id: ids).ids ] }.reject { |_, ids| ids.empty? }
        raise ToolError, t("errors.deliverable_unknown", details: missing.map { |key, ids| "#{key} #{ids.join(', ')}" }.join(" ; ")) if missing.any?
        changed = scopes.sum { |_, (scope, ids)| ids.empty? ? 0 : scope.where(id: ids).update_all(in_deliverable:, updated_at: Time.current) }
        publication = map.deliverable
        {
          changed:, in_deliverable:,
          marked: Deliverable::Contents.new(map).counts.transform_keys { _1.to_s.underscore },
          deliverable_url: publication&.live? ? "#{origin}#{publication.page_path}" : nil,
          note: t(publication&.live? ? "notes.deliverable_marked" : "notes.deliverable_marked_unpublished")
        }.compact
      end

      private
        def summarize_result(data) = { changed: data[:changed] }
    end
  end
end

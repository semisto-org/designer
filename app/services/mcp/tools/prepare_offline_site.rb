module Mcp
  module Tools
    # The map packed as a website that opens without Terranova (MapOfflineSite):
    # the plan over its aerial photo, the garden through the years, the
    # photos, the documents and the raw data, in one zip. The AI starts the
    # build and gives the person the link; the person downloads it, signed
    # in, from their own browser. Any role, any plan, archived maps too:
    # nothing is taken hostage.
    class PrepareOfflineSite < Base
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          include_networks: { type: "boolean", description: :include_networks },
          rebuild: { type: "boolean", description: :offline_rebuild }
        },
        required: %w[map_id]
      )
      hints read_only: false

      def perform(map_id:, include_networks: false, rebuild: false)
        map = Map.includes(:region).find_by(id: map_id)
        @role = map&.role_for(user)
        raise ToolError, t("errors.map_not_found", id: map_id) unless @role
        @map = map
        networks = networks_visible?(include_networks)
        site = map.offline_site
        fresh = site&.ready? && site.include_networks == networks && !rebuild
        site = MapOfflineSite.request!(map, by: user, include_networks: networks) unless fresh
        site.reload
        status = site.ready? ? "ready" : (site.failed? ? "failed" : "building")
        {
          status:, include_networks: site.include_networks,
          finished_at: site.finished_at&.iso8601,
          byte_size: (site.archive.blob.byte_size if site.ready?),
          contents: (site.summary.slice("photos", "videos", "documents", "skipped") if site.ready?),
          download_url: ("#{origin}/maps/#{map.id}/offline_site/download" if site.ready?),
          editor_url: map_url(map)
        }.compact
      end

      private
        def summarize_result(data) = { status: data[:status] }
    end
  end
end

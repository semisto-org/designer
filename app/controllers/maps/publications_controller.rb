module Maps
  # The owner's "Publier" panel: publish a snapshot of the map at a shareable
  # address, refresh it, unpublish, or get a new address.
  #
  # Maps::DeliverablesController does the same for the client deliverable.
  class PublicationsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_publisher!

    # `?public=1` adds what the public view shows, to paint the video from
    # (public_maps/video.ts).
    def show
      publication = publication_of(@map)
      return render json: payload.merge(publicProps: publication.as_public) if params[:public].present? && publication&.live?
      render json: payload
    end

    # Publishing and refreshing are the same gesture: take a new snapshot.
    def create
      publish
    end

    def update
      return head :not_found unless publication_of(@map)
      publish
    end

    def destroy
      publication_of(@map)&.unpublish!
      render json: payload(@map.reload)
    end

    def renew
      publication = publication_of(@map) or return head :not_found
      publication.renew_address!
      render json: payload(@map.reload)
    end

    private
      def kind = "public"
      def require_publisher! = require_owner!
      def publication_of(map) = map.publication
      def publication_url(publication) = public_map_url(publication.token)

      def publish
        attrs = params.fetch(:publication, {}).permit(:title, :description, options: {})
        options = params.dig(:publication, :options)
        MapPublication.publish!(@map, by: Current.user, title: attrs[:title], description: attrs[:description], options: options.presence, kind:)
        map = @map.reload
        # What the panel paints the link preview from (collab/preview.ts).
        render json: payload(map).merge(publicProps: publication_of(map).as_public), status: :ok
      rescue ActiveRecord::RecordInvalid => e
        render json: { message: e.record.errors.full_messages.to_sentence, errors: e.record.errors.to_hash(true) }, status: :unprocessable_entity
      end

      def payload(map = @map)
        publication = publication_of(map)
        # Partial flights with no photo over this map: not offered as a base.
        uncovered = PhotoArchive::Coverage.uncovered(map)
        {
          publication: publication && publication.as_inertia.merge(url: publication_url(publication)),
          defaults: { title: map.name, options: MapPublication.normalize_options(nil, map, kind:) },
          featureLayers: MapFeature::LAYERS.map { |key| { key:, count: map.features.active.in_design.where(layer: key).count } },
          regionLayers: map.region.catalogue.enabled.reject { |layer| uncovered.include?(layer.key) }.map do |layer|
            { key: layer.key, name: layer.name, category: layer.category, group: layer.group_name,
              sensitive: Collab::PublicSnapshot.sensitive_region_layer?(layer) }
          end,
          # The drone view a publication would show (the newest), if any.
          aerialView: map.aerial_views.ready.first&.as_inertia&.slice(:name, :capturedOn)
        }
      end
  end
end

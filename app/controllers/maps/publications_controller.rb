module Maps
  # The owner's "Publier" panel: publish a snapshot of the map at a shareable
  # address, refresh it, unpublish, or get a new address.
  class PublicationsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_owner!

    def show
      render json: payload
    end

    # Publishing and refreshing are the same gesture: take a new snapshot.
    def create
      publish
    end

    def update
      return head :not_found unless @map.publication
      publish
    end

    def destroy
      @map.publication&.unpublish!
      render json: payload(@map.reload)
    end

    def renew
      publication = @map.publication or return head :not_found
      publication.renew_address!
      render json: payload(@map.reload)
    end

    private
      def publish
        attrs = params.fetch(:publication, {}).permit(:title, :description, options: {})
        options = params.dig(:publication, :options)
        MapPublication.publish!(@map, by: Current.user, title: attrs[:title], description: attrs[:description], options: options.presence)
        render json: payload(@map.reload), status: :ok
      rescue ActiveRecord::RecordInvalid => e
        render json: { message: e.record.errors.full_messages.to_sentence, errors: e.record.errors.to_hash(true) }, status: :unprocessable_entity
      end

      def payload(map = @map)
        publication = map.publication
        {
          publication: publication && publication.as_inertia.merge(url: public_map_url(publication.token)),
          defaults: { title: map.name, options: MapPublication.normalize_options(nil, map) },
          featureLayers: MapFeature::LAYERS.map { |key| { key:, count: map.features.active.where(layer: key).count } },
          regionLayers: map.region.layers.enabled.map do |layer|
            { key: layer.key, name: layer.name, category: layer.category, group: layer.group_name,
              sensitive: Collab::PublicSnapshot.sensitive_region_layer?(layer) }
          end,
          # The drone view a publication would show (the newest), if any.
          aerialView: map.aerial_views.first&.as_inertia&.slice(:name, :capturedOn)
        }
      end
  end
end

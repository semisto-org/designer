module Imports
  module Claudy
    # Claudy's map, read live from its agent API v1 (Client). The listings
    # give the features and the plants; each imported one is read again in
    # detail for its dated notes and photos. Map layers and sketches are not
    # exposed by the API: networks are recognised from their node types
    # (NetworkResolver) and sketches need the export file (FileSource).
    class ApiSource
      attr_reader :client

      def initialize(client = Client.from_env)
        @client = client
      end

      def label = I18n.t("claudy_import.report.source_api", url: client.base_url)

      def map_features = (@map_features ||= client.each_map_feature.to_a)
      def plants = (@plants ||= client.each_plant.to_a)
      def map_layers = []

      # nil: this source cannot list sketches (an empty list would say « none »).
      def sketches = nil

      def feature_detail(row) = client.map_feature(row["id"]) || {}
      def plant_detail(row) = client.plant(row["id"]) || {}

      def photo_file(photo, max_bytes:)
        raise Error.new(:photo_missing) if photo["url"].blank?
        client.download(photo["url"], max_bytes:)
      end
    end
  end
end

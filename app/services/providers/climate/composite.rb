module Providers
  module Climate
    # Routes each capability to the provider chosen for it, e.g. normals and
    # projections from the region's static data, forecast from Open-Meteo.
    class Composite < Provider
      def initialize(normals:, projections:, forecast:)
        @providers = { normals:, projections:, forecast: }
      end

      def key = "composite"

      def provider_for(capability) = @providers.fetch(capability)

      # Which provider serves what, for the UI and the logs.
      def sources = @providers.transform_values(&:key)

      def supports?(capability) = provider_for(capability).supports?(capability)

      def current_normals(point) = provider_for(:normals).current_normals(point)

      def projection(point, horizon:, scenario:) = provider_for(:projections).projection(point, horizon:, scenario:)

      def forecast(point) = provider_for(:forecast).forecast(point)
    end
  end
end

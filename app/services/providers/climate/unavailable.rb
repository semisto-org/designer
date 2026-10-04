module Providers
  module Climate
    # No climate data at all: every capability answers "unavailable".
    class Unavailable < Provider
      def initialize(reason = :not_configured)
        @reason = reason
      end

      def current_normals(_point) = unavailable(@reason)

      def projection(_point, horizon:, scenario:)
        validate_projection!(horizon, scenario)
        unavailable(@reason)
      end

      def forecast(_point) = unavailable(@reason)
    end
  end
end

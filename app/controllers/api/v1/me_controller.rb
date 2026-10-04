# Who is signed in on the phone, with their plan and what the server offers.
module Api
  module V1
    class MeController < BaseController
      def show
        render json: {
          user: Current.user.as_inertia,
          entitlements: Current.user.entitlements.as_json,
          env: { plantnet: Providers::PlantNet.configured? }
        }
      end
    end
  end
end

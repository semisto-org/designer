# Who is signed in on the phone, with their plan and what the server offers.
module Api
  module V1
    class MeController < BaseController
      rate_limit to: 3, within: 1.hour, only: :deletion_request, by: -> { Current.user.id },
        with: -> { render json: { message: t("account.rate_limited") }, status: :too_many_requests }

      def show
        render json: {
          user: Current.user.as_inertia,
          entitlements: Current.user.entitlements.as_json,
          env: { plantnet: Providers::PlantNet.configured? }
        }
      end

      # « Supprimer mon compte » in the app (required by Apple): the same
      # request as on the account page, handled by Semisto.
      def deletion_request
        AccountMailer.deletion_request(Current.user).deliver_later
        AccountMailer.deletion_confirmation(Current.user).deliver_later
        render json: { message: t("account.deletion_sent") }, status: :accepted
      end
    end
  end
end

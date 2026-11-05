# The phone app registers its Expo push token after sign-in (and at each
# launch, which keeps `last_seen_at`), and forgets it on sign-out.
module Api
  module V1
    class PushDevicesController < BaseController
      def create
        device = PushDevice.register!(Current.user, token: params.require(:token).to_s, platform: params[:platform].to_s.presence)
        render json: { id: device.id, push: Current.user.chat_notify_push }, status: :created
      rescue ActiveRecord::RecordInvalid
        render json: { message: t("notifications.push.invalid_token") }, status: :unprocessable_entity
      end

      def destroy
        Current.user.push_devices.where(token: params.require(:token).to_s).delete_all
        head :no_content
      end
    end
  end
end

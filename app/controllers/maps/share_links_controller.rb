module Maps
  # The "anyone with the link joins as…" link (owner only). Resetting gives a
  # new address; disabling makes every copy useless.
  class ShareLinksController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_owner!

    # Enable the link (creating it the first time), optionally with a role.
    def create
      link = @map.share_link || @map.build_share_link(created_by: Current.user)
      role = params.dig(:share_link, :role).presence
      link.role = role if role
      link.save!
      link.enable!
      render_sharing(:created)
    rescue ActiveRecord::RecordInvalid
      render json: { message: t("collab.sharing.errors.role") }, status: :unprocessable_entity
    end

    # A different role gives a different link, so old copies keep their meaning.
    def update
      link = @map.share_link or return head :not_found
      link.change_role!(params.require(:share_link).require(:role))
      render_sharing
    rescue ActiveRecord::RecordInvalid
      render json: { message: t("collab.sharing.errors.role") }, status: :unprocessable_entity
    end

    def reset
      link = @map.share_link or return head :not_found
      link.reset!
      render_sharing
    end

    def destroy
      @map.share_link&.disable!
      render_sharing
    end

    private
      def render_sharing(status = :ok)
        render json: Collab::SharingPayload.new(@map.reload, Current.user, url_helpers: self), status:
      end
  end
end

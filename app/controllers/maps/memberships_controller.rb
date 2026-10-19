module Maps
  # Change a member's role or mark them as an owner of the place (owner
  # only), remove them (owner) or leave the map (anyone but the owner, on
  # their own membership).
  class MembershipsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :set_membership
    before_action :require_owner!, only: :update

    def update
      attrs = params.require(:membership)
      if attrs.key?(:role)
        role = attrs[:role].to_s
        return render_message(t("collab.sharing.errors.role"), :unprocessable_entity) unless %w[editor viewer].include?(role)
        return render_message(t("collab.sharing.errors.owner_fixed"), :unprocessable_entity) if @membership.role == "owner"
        @membership.role = role
      end
      # The map's owner may own the place too.
      @membership.place_owner = ActiveModel::Type::Boolean.new.cast(attrs[:place_owner]) if attrs.key?(:place_owner)

      @membership.save!
      render_sharing
    rescue ActiveRecord::RecordInvalid => e
      render_message(e.message, :unprocessable_entity)
    end

    def destroy
      leaving = @membership.user_id == Current.user.id
      return render_message(t("maps.errors.owner_only"), :forbidden) unless leaving || @role == "owner"
      return render_message(t("collab.sharing.errors.owner_stays"), :unprocessable_entity) if @membership.role == "owner"

      @membership.destroy!
      CommentSubscription.purge(@membership.user, @map)
      if leaving
        render json: { left: true }
      else
        render_sharing
      end
    end

    private
      def set_membership
        @membership = @map.memberships.find(params[:id])
      end

      def render_sharing
        render json: Collab::SharingPayload.new(@map, Current.user, url_helpers: self)
      end

      def render_message(message, status)
        render json: { message: }, status:
      end
  end
end

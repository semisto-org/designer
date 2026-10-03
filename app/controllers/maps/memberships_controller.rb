module Maps
  # Change a member's role (owner only), remove them (owner) or leave the map
  # (anyone but the owner, on their own membership).
  class MembershipsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :set_membership
    before_action :require_owner!, only: :update

    def update
      role = params.require(:membership).require(:role)
      return render_message(t("collab.sharing.errors.role"), :unprocessable_entity) unless %w[editor viewer].include?(role)
      return render_message(t("collab.sharing.errors.owner_fixed"), :unprocessable_entity) if @membership.role == "owner"
      raise Map::EditorLimitReached if role == "editor" && @membership.role != "editor" && @map.editors_count >= Map::MAX_EDITORS

      @membership.update!(role:)
      render_sharing
    rescue Map::EditorLimitReached => e
      render_message(e.message, :unprocessable_entity)
    rescue ActiveRecord::RecordInvalid => e
      render_message(editor_limit?(e.record) ? Map::EditorLimitReached.new.message : e.message, :unprocessable_entity)
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

      def editor_limit?(record) = record.errors.of_kind?(:role, :editor_limit)

      def render_sharing
        render json: Collab::SharingPayload.new(@map, Current.user, url_helpers: self)
      end

      def render_message(message, status)
        render json: { message: }, status:
      end
  end
end

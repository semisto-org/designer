module Maps
  # « Transférer la carte » (MapTransfer). The owner proposes the map to an
  # editor and can cancel the proposal (JSON, from the sharing dialog); the
  # recipient answers from the e-mail or the app, on their own screen
  # (Inertia). Outsiders get a 404, other participants the usual forbidden
  # response for a map action.
  class TransfersController < ApplicationController
    include MapScoped

    rate_limit to: 20, within: 1.hour, only: :create,
               with: -> { render json: { message: t("transfer.errors.rate_limited") }, status: :too_many_requests }

    before_action :set_map, only: %i[index create]
    before_action :set_transfer, except: %i[index create]
    before_action :require_owner!, only: %i[create destroy]
    before_action :require_recipient!, only: %i[show accept decline]

    # The sharing dialog's section (owner) or the proposal made to me (editor).
    def index
      render json: section_payload
    end

    def create
      recipient = @map.participants.find_by(id: params.require(:transfer).require(:recipient_id))
      return render_message(t("transfer.errors.recipient_missing"), :unprocessable_entity) unless recipient

      MapTransfer.propose!(map: @map, from: Current.user, to: recipient)
      render json: section_payload, status: :created
    rescue ActiveRecord::RecordInvalid => e
      raise unless e.record.is_a?(MapTransfer)
      render_message(e.record.errors.full_messages.to_sentence, :unprocessable_entity)
    rescue ActiveRecord::RecordNotUnique
      render_message(t("activerecord.errors.models.map_transfer.already_pending"), :unprocessable_entity)
    end

    # The recipient's screen: the proposal, what changes, the plan impact.
    def show
      render inertia: "maps/transfers/show", props: Transfers::PagePayload.new(@transfer, Current.user).as_json
    end

    def destroy
      @transfer.cancel!(by: Current.user)
      render json: section_payload
    rescue MapTransfer::Refused => e
      render_message(e.message, :unprocessable_entity)
    end

    def accept
      @transfer.accept!(by: Current.user)
      respond_to do |format|
        format.json { render json: { state: @transfer.state, mapPath: map_path(@map) } }
        format.any { redirect_to map_path(@map), notice: t("transfer.flash.accepted", map: @map.name), status: :see_other }
      end
    rescue MapTransfer::Refused => e
      refuse(e)
    end

    def decline
      @transfer.decline!(by: Current.user)
      respond_to do |format|
        format.json { render json: { state: @transfer.state } }
        format.any do
          target = @map.viewable_by?(Current.user) ? map_path(@map) : maps_path
          redirect_to target, notice: t("transfer.flash.declined", from: @transfer.from_user.display_name), status: :see_other
        end
      end
    rescue MapTransfer::Refused => e
      refuse(e)
    end

    private
      # The recipient may have lost access to the map meanwhile: they still
      # see what became of the proposal (and cannot accept it).
      def set_transfer
        @map = Map.find(params[:map_id])
        @transfer = @map.transfers.find(params[:id])
        @role = @map.role_for(Current.user)
        head :not_found unless @role || @transfer.to_user_id == Current.user.id
      end

      def require_recipient!
        return if @transfer.to_user_id == Current.user.id
        respond_to do |format|
          format.json { render_message(t("transfer.errors.recipient_only"), :forbidden) }
          format.any { redirect_to map_path(@map), alert: t("transfer.errors.recipient_only") }
        end
      end

      def refuse(error)
        respond_to do |format|
          format.json { render json: { message: error.message, reason: error.reason }, status: :unprocessable_entity }
          format.any { redirect_to map_transfer_path(@map, @transfer), alert: error.message, status: :see_other }
        end
      end

      def section_payload
        Transfers::SectionPayload.new(@map, Current.user, url_helpers: self)
      end

      def render_message(message, status)
        render json: { message: }, status:
      end
  end
end

# A new request on the team board: « Qualifier » turns it into a team map
# in the « Demande » phase with the person who will lead it; « Refuser »
# closes it with a note; its status follows the call and the visit.
module Teams
  class BoardRequestsController < ApplicationController
    include TeamScoped

    before_action :set_team
    before_action :set_request

    def update
      attrs = params.require(:request).permit(:status, :decline_note)
      if @request.update(attrs)
        head :no_content
      else
        render json: { message: @request.errors.full_messages.to_sentence }, status: :unprocessable_entity
      end
    end

    def qualify
      map = ProjectRequests::MakeMap.new(@request, Current.user).call
      map.update_board!(phase: "request", lead_id: params[:lead_id].presence || Current.user.id)
      redirect_to team_board_path(@team), notice: t("team_board.requests.qualified", name: map.name), status: :see_other
    rescue ProjectRequests::MakeMap::Refused, ActiveRecord::RecordInvalid => e
      redirect_to team_board_path(@team), alert: e.message, status: :see_other
    end

    private
      def set_request
        form = RequestForm.find_by!(owner: @team)
        @request = form.project_requests.where(map_id: nil).find(params[:id])
      end
  end
end

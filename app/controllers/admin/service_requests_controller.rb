# Semisto staff: the requests sent from maps, with their status. Admins only
# (anyone else gets a 404, as if the page did not exist).
module Admin
  class ServiceRequestsController < ApplicationController
    before_action :require_admin!

    FILTERS = %w[open new contacted closed all].freeze

    def index
      filter = FILTERS.include?(params[:status]) ? params[:status] : "open"
      scope = ServiceRequest.includes(:user, :map, :handled_by).newest_first
      scope = scope.where(kind: params[:kind]) if ServiceRequest::KINDS.include?(params[:kind])
      requests = case filter
      when "open" then scope.pending
      when "all" then scope
      else scope.where(status: filter)
      end
      render inertia: "admin/requests/index", props: {
        requests: requests.limit(300).map(&:as_admin_json),
        counts: counts,
        filters: { status: filter, kind: params[:kind].presence_in(ServiceRequest::KINDS) }
      }
    end

    def update
      service_request = ServiceRequest.find(params[:id])
      attributes = params.require(:service_request).permit(:status, :admin_notes)
      service_request.assign_attributes(attributes)
      service_request.handled_by = Current.user if service_request.will_save_change_to_status?
      if service_request.save
        redirect_back_or_to admin_requests_path, notice: t("journey.admin.saved"), status: :see_other
      else
        redirect_back_or_to admin_requests_path, alert: service_request.errors.full_messages.to_sentence, status: :see_other
      end
    end

    private
      def require_admin!
        head :not_found unless Current.user&.admin?
      end

      def counts
        by_status = ServiceRequest.group(:status).count
        { new: by_status["new"].to_i, contacted: by_status["contacted"].to_i, closed: by_status["closed"].to_i,
          open: by_status["new"].to_i + by_status["contacted"].to_i, all: by_status.values.sum }
      end
  end
end

# "Passer à l'action": requests sent from a map to Semisto. Every member
# sees the requests of the map; only the owner sends one (it shares their
# map with Semisto staff while the request is open).
module Maps
  class ServiceRequestsController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_owner!, only: :create

    rate_limit to: 10, within: 1.hour, only: :create, by: -> { Current.user&.id || request.remote_ip }, with: -> {
      render json: { message: t("journey.requests.rate_limited") }, status: :too_many_requests
    }

    def index
      render json: index_payload
    end

    def create
      attributes = params.require(:service_request)
      service_request = @map.service_requests.new(
        user: Current.user,
        kind: attributes[:kind].to_s,
        contact_consent: ActiveModel::Type::Boolean.new.cast(attributes[:contact_consent]) == true,
        payload: attributes[:payload]
      )
      if service_request.save
        render json: { request: service_request.as_member_json, **index_payload }, status: :created
      else
        render_errors service_request
      end
    end

    private
      def index_payload
        payload = { requests: @map.service_requests.newest_first.map(&:as_member_json), canCreate: @role == "owner" }
        if @role == "owner"
          payload[:prefill] = ServiceRequest::Prefill.new(@map).as_json
          payload[:schema] = ServiceRequest.schema_json
        end
        payload
      end
  end
end

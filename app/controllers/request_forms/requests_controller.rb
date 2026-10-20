# One request (ProjectRequest) of a form I read (RequestFormsController):
# what the prospect sent, its place on a map, the team's status and notes,
# and « Créer la carte », which turns it into a map for the offer builder.
module RequestForms
  class RequestsController < ApplicationController
    before_action :set_request

    def show
      render inertia: "request_forms/requests/show", props: {
        request: request_json,
        account: @form.display_name,
        schema: ProjectRequest.answers_schema,
        statuses: ProjectRequest::STATUSES,
        layers: (@request.region || Region.europe || Region.default).catalogue.enabled.bases.map(&:as_inertia)
      }
    end

    def update
      if @request.update(params.require(:request).permit(:status, :team_notes))
        render json: { request: request_json }
      else
        render_errors @request
      end
    end

    # « Créer la carte »: a map of the place, then straight to its offer.
    # The map is made after the call and the visit (« Créer la carte et
    # chiffrer l'offre »): a request still earlier moves on to « Visitée ».
    def map
      map = ProjectRequests::MakeMap.new(@request, Current.user).call
      @request.update!(status: "visited") if %w[new called].include?(@request.status)
      redirect_to map_offer_path(map), notice: t("request_forms.requests.map_made"), status: :see_other
    rescue ProjectRequests::MakeMap::Refused => error
      redirect_to request_form_request_path(@form, @request), alert: error.message, status: :see_other
    end

    private
      def set_request
        @form = RequestForm.find(params[:request_form_id])
        raise ActiveRecord::RecordNotFound unless @form.reader?(Current.user)
        @request = @form.project_requests.find(params[:id])
      end

      def request_json
        r = @request
        {
          id: r.id, formId: @form.id, name: r.name, email: r.email, phone: r.phone, address: r.address,
          message: r.message, answers: r.answers, status: r.status, teamNotes: r.team_notes,
          createdAt: r.created_at.iso8601, statusChangedAt: r.status_changed_at&.iso8601,
          areaM2: r.area_m2, parcels: r.parcels,
          center: r.center && [ r.center.x, r.center.y ],
          boundary: r.boundary && RGeo::GeoJSON.encode(r.boundary),
          mapId: r.map_id, mapName: r.map&.name,
          photos: r.photos.map { |photo| { id: photo.id, url: url_for(photo.variant(resize_to_limit: [ 900, 900 ], format: :jpeg)), name: photo.filename.to_s } }
        }
      end
  end
end

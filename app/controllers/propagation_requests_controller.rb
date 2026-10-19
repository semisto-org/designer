# /propagation_requests (« Demandes de multiplication »): the requests for
# scions, cuttings or seeds received by the places I own, and the ones I
# sent. A request is sent from a species sheet (JSON, « Dans d'autres
# jardins »), answered here by an owner of the place, withdrawn by its author.
class PropagationRequestsController < ApplicationController
  rate_limit to: 20, within: 1.day, only: :create,
             with: -> { render json: { message: t("propagation.errors.rate_limited") }, status: :too_many_requests }

  before_action :set_request, only: %i[update destroy]

  def index
    render inertia: "propagation_requests/index", props: {
      received: PropagationRequest.received_by(Current.user).includes(:map, :species, :variety, :requester, :answered_by).newest_first.limit(200).map { |r| received_json(r) },
      sent: Current.user.propagation_requests.includes(:map, :species, :variety, :answered_by, map: :region).newest_first.limit(200).map { |r| sent_json(r) },
      places: Current.user.map_memberships.where(place_owner: true).includes(:map).map { |m| place_json(m.map) }
    }
  end

  def create
    attrs = params.require(:propagation_request).permit(:map_id, :species_id, :variety_id, :material, :message)
    map = SharedPlantings.shared_maps.find_by(id: attrs[:map_id])
    return render json: { message: t("propagation.errors.closed") }, status: :not_found unless map

    propagation_request = PropagationRequest.new(attrs.except(:map_id).merge(map:, requester: Current.user, variety_id: attrs[:variety_id].presence))
    return render_errors(propagation_request) unless propagation_request.save

    render json: { id: propagation_request.id, message: t("propagation.sent") }, status: :created
  end

  # An owner of the place accepts or declines, with a word for the requester.
  def update
    return redirect_to(propagation_requests_path, alert: t("propagation.errors.not_yours")) unless @propagation_request.answerable_by?(Current.user)

    answer = params.dig(:propagation_request, :answer)
    case params.dig(:propagation_request, :decision)
    when "accept" then @propagation_request.accept!(Current.user, answer:)
    when "decline" then @propagation_request.decline!(Current.user, answer:)
    else return redirect_to(propagation_requests_path, alert: t("propagation.errors.decision"))
    end
    redirect_to propagation_requests_path, notice: t("propagation.answered.#{@propagation_request.status}")
  rescue ActiveRecord::RecordInvalid => e
    redirect_to propagation_requests_path, alert: e.record.errors.full_messages.to_sentence
  end

  # Its author withdraws a request still waiting.
  def destroy
    return redirect_to(propagation_requests_path, alert: t("propagation.errors.not_yours")) unless @propagation_request.requester_id == Current.user.id

    @propagation_request.withdraw!
    redirect_to propagation_requests_path, notice: t("propagation.withdrawn")
  end

  private
    def set_request
      @propagation_request = PropagationRequest.find(params[:id])
    end

    def plant_json(request)
      { speciesId: request.species_id, name: request.plant_name, latinName: request.variety&.full_latin_name || request.species.latin_name }
    end

    # The owners see who asks, never their address until they accept.
    def received_json(request)
      base_json(request).merge(
        map: { id: request.map_id, name: request.map.name },
        requester: { name: request.requester.display_name, avatarUrl: request.requester.avatar_url, email: (request.requester.email_address if request.accepted?) },
        canAnswer: request.answerable_by?(Current.user)
      )
    end

    def sent_json(request)
      owner = request.answered_by if request.accepted?
      base_json(request).merge(
        region: request.map.region&.name,
        owner: owner && { name: owner.display_name, email: owner.email_address }
      )
    end

    def base_json(request)
      {
        id: request.id, plant: plant_json(request), material: request.material, message: request.message,
        status: request.status, answer: request.answer, answeredBy: request.answered_by&.display_name,
        createdAt: request.created_at.iso8601, answeredAt: request.answered_at&.iso8601
      }
    end

    def place_json(map)
      { id: map.id, name: map.name, sharesPlantedPalette: map.shares_planted_palette, acceptsPropagationRequests: map.accepts_propagation_requests }
    end
end

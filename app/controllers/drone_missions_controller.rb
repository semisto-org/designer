# « Missions drone »: the missions I booked as a client and, if I am a pilot,
# the ones asked of me. A mission is requested from a pilot's page, answered
# by the pilot, paid by the client (Stripe Checkout), delivered by the pilot
# on the map, then confirmed by the client (or disputed, for Semisto to
# settle).
class DroneMissionsController < ApplicationController
  rate_limit to: 10, within: 1.day, only: :create,
             with: -> { redirect_back_or_to drone_pilots_path, alert: t("drone_missions.errors.rate_limited") }

  before_action :set_mission, only: %i[show update checkout]

  def index
    as_client = Current.user.drone_missions.includes(:map, drone_pilot: :user).newest_first.limit(100)
    as_pilot = DroneMission.for_pilot_user(Current.user).includes(:map, :client).newest_first.limit(200)
    render inertia: "drone_missions/index", props: {
      asClient: as_client.map { row_json(_1) },
      asPilot: as_pilot.map { row_json(_1) },
      pilot: Current.user.drone_pilot&.then { { status: _1.status, listed: _1.listed? } }
    }
  end

  def show
    record_return_from_checkout
    render inertia: "drone_missions/show", props: { mission: mission_json(@mission) }
  end

  def create
    attrs = params.require(:drone_mission).permit(:drone_pilot_id, :map_id, :desired_period, :message, data_types: [])
    pilot = DronePilot.listed.find_by(id: attrs[:drone_pilot_id])
    map = DronePilots::Directory.bookable_maps(Current.user).find { _1.id.to_s == attrs[:map_id].to_s }
    return redirect_to(drone_pilots_path, alert: t("drone_pilots.errors.not_listed")) unless pilot
    return redirect_to(drone_pilot_path(pilot), alert: t("drone_missions.errors.map")) unless map

    mission = DroneMission.request!(client: Current.user, pilot:, map:, desired_period: attrs[:desired_period], message: attrs[:message],
      data_types: Array(attrs[:data_types]) & DroneCatalog::DATA_TYPES)
    redirect_to drone_mission_path(mission), notice: t("drone_missions.flash.requested", pilot: pilot.display_name)
  rescue ActiveRecord::RecordInvalid => e
    redirect_to drone_pilot_path(pilot, map_id: map&.id), inertia: { errors: field_errors(e.record) }
  end

  # What the pilot or the client decides on the mission's page.
  def update
    decision = params.dig(:drone_mission, :decision).to_s
    text = params.dig(:drone_mission, :text)
    case decision
    when "accept" then pilot! { @mission.accept!(flight_on: params.dig(:drone_mission, :flight_on).presence, reply: text) }
    when "decline" then pilot! { @mission.decline!(reply: text) }
    when "deliver" then pilot! { @mission.deliver!(note: text) }
    when "cancel" then client! { @mission.cancel! }
    when "confirm" then client! { @mission.confirm! }
    when "dispute" then client! { @mission.dispute!(message: text) }
    else return redirect_to(drone_mission_path(@mission), alert: t("drone_missions.errors.decision"))
    end
    redirect_to drone_mission_path(@mission), notice: t("drone_missions.flash.#{decision}") unless performed?
  rescue DroneMission::InvalidTransition
    redirect_to drone_mission_path(@mission), alert: t("drone_missions.errors.state")
  rescue ActiveRecord::RecordInvalid => e
    redirect_to drone_mission_path(@mission), inertia: { errors: field_errors(e.record) }
  end

  # « Payer la mission »: the client goes to Stripe.
  def checkout
    return redirect_to(drone_mission_path(@mission), alert: t("drone_missions.errors.not_yours")) unless @mission.client?(Current.user)
    url = DroneMissions::Checkout.call(@mission,
      success_url: "#{drone_mission_url(@mission)}?session_id={CHECKOUT_SESSION_ID}", cancel_url: drone_mission_url(@mission))
    redirect_to url, allow_other_host: true
  rescue DroneMissions::Checkout::Unavailable
    redirect_to drone_mission_path(@mission), alert: t("drone_missions.errors.payment_unavailable")
  rescue Providers::StripeGateway::Error => e
    Rails.error.report(e, handled: true)
    redirect_to drone_mission_path(@mission), alert: t("drone_missions.errors.payment_failed")
  end

  private
    def set_mission
      @mission = DroneMission.includes(:map, :client, drone_pilot: :user).find(params[:id])
      head :not_found unless @mission.client?(Current.user) || @mission.pilot_user?(Current.user)
    end

    def pilot!
      return redirect_to(drone_mission_path(@mission), alert: t("drone_missions.errors.not_yours")) unless @mission.pilot_user?(Current.user)
      yield
    end

    def client!
      return redirect_to(drone_mission_path(@mission), alert: t("drone_missions.errors.not_yours")) unless @mission.client?(Current.user)
      yield
    end

    # Back from Stripe: the payment is recorded now rather than when the webhook comes.
    def record_return_from_checkout
      return unless params[:session_id].present? && @mission.accepted? && @mission.client?(Current.user) && Billing.enabled?
      session = Providers::StripeGateway.new.retrieve_checkout_session(params[:session_id])
      DroneMissions::Payment.call(session) if session.dig("metadata", "drone_mission_id").to_s == @mission.id.to_s
      @mission.reload
    rescue Providers::StripeGateway::Error => e
      Rails.error.report(e, handled: true)
    end

    def row_json(mission)
      { id: mission.id, status: mission.status, mapName: mission.map.name, pilotName: mission.drone_pilot.display_name,
        clientName: mission.client.display_name, totalCents: mission.total_cents, flightOn: mission.flight_on&.iso8601,
        createdAt: mission.created_at.iso8601, disputed: mission.disputed? }
    end

    def mission_json(mission)
      pilot_side = mission.pilot_user?(Current.user)
      contact = %w[paid delivered completed].include?(mission.status)
      {
        id: mission.id, status: mission.status, role: pilot_side ? "pilot" : "client",
        map: { id: mission.map.id, name: mission.map.name, address: mission.map.address },
        pilot: DronePilots::Directory.card(mission.drone_pilot).merge(
          phone: (mission.drone_pilot.phone if contact), email: (mission.drone_pilot.user.email_address if contact)
        ),
        client: { name: mission.client.display_name, avatarUrl: mission.client.avatar_url, email: (mission.client.email_address if contact) },
        dataTypes: mission.data_types, desiredPeriod: mission.desired_period, message: mission.message,
        pilotReply: mission.pilot_reply, flightOn: mission.flight_on&.iso8601, deliveryNote: mission.delivery_note,
        disputed: mission.disputed?, disputeMessage: mission.dispute_message,
        quote: mission.quote.as_json,
        createdAt: mission.created_at.iso8601, acceptedAt: mission.accepted_at&.iso8601, paidAt: mission.paid_at&.iso8601,
        deliveredAt: mission.delivered_at&.iso8601, paidOutAt: mission.paid_out_at&.iso8601,
        confirmBy: mission.delivered_at && (mission.delivered_at + DroneMission::CONFIRMATION_DELAY).iso8601,
        canDeliver: mission.deliverable_by?(Current.user),
        paymentOpen: Billing.enabled?,
        delivered: {
          views: mission.aerial_views.newest_first.map { |v| { id: v.id, name: v.name, capturedOn: v.captured_on.iso8601, status: v.status, failure: v.failure } },
          photosCount: mission.photos.count,
          files: mission.files.includes(:blob).map { |f| { id: f.id, filename: f.filename.to_s, byteSize: f.byte_size, url: drone_mission_file_path(mission, f) } }
        }
      }
    end

    # One message per field: our own messages are whole sentences (they
    # start with a capital), Rails' generic ones need the field's name.
    def field_errors(record)
      record.errors.group_by_attribute.transform_values do |errors|
        message = errors.first.message
        message.match?(/\A\p{Lu}/) ? message : errors.first.full_message
      end
    end
end

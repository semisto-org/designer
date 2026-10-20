# « Et chez toi ? » (/essai): from a public map, a visitor types their
# address and sees their own place, without an account: its parcel, what
# its relief says and what the region knows. The trial lives 48 hours
# (MapTrial); « Garder ce carnet » signs them up and makes it their first
# map. Narrow endpoints of its own, rate limited per address. The home page
# starts a trial too (`via: home`): its last chapter asks « Où est ton
# terrain ? ».
class TrialsController < ApplicationController
  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }
  before_action :set_trial, only: %i[show reading parcel keep]
  rate_limit to: 10, within: 10.minutes, only: :create,
    with: -> { render json: { message: t("trials.errors.rate_limited") }, status: :too_many_requests }
  rate_limit to: 10, within: 3.minutes, only: :keep,
    with: -> { redirect_to trial_path(params[:token]), alert: t("sessions.rate_limited") }
  rate_limit to: 60, within: 1.minute, only: %i[geocode parcel reading],
    with: -> { render json: { message: t("trials.errors.rate_limited") }, status: :too_many_requests }

  def new
    publication = source_publication
    remember_source(publication)
    render inertia: "trials/new", props: {
      from: publication && { token: publication.token, title: publication.title, path: publication.public_path },
      region: (Region.europe || Region.default).as_inertia
    }
  end

  # { lng, lat, address, from }: the trial, or why not.
  def create
    publication = source_publication
    trial = MapTrial.start(lng: params[:lng], lat: params[:lat], address: params[:address], source_publication: publication, origin: params[:via])
    remember_source(publication)
    session[:signup_via] ||= "trial"
    render json: { token: trial.token, path: trial_path(trial.token) }, status: :created
  rescue ArgumentError, TypeError, ActiveRecord::RecordInvalid
    render json: { message: t("trials.errors.invalid_place") }, status: :unprocessable_entity
  end

  def show
    return adopt(Current.user) if authenticated? && (@trial.claimed_by?(Current.user) || session[:pending_trial] == @trial.token)

    region = @trial.region || Region.europe || Region.default
    catalogue = region.catalogue.enabled
    cadastre = catalogue.detect { |l| l.role == "cadastre" }
    render inertia: "trials/show", props: {
      trial: @trial.as_inertia,
      layers: [ *catalogue.bases, cadastre ].compact.uniq.map(&:as_inertia),
      cadastreLayer: cadastre&.key,
      knows: region_knowledge(catalogue),
      regionName: region.europe? ? nil : region.name,
      from: @trial.source_publication&.then { |p| p.live? ? { token: p.token, title: p.title, path: p.public_path } : nil },
      maxParcels: MapTrial::MAX_PARCELS,
      # The address a sign-in link was just sent to (« Garder ce carnet »).
      sentTo: (@trial.claimant&.email_address if params[:sent].present?)
    }
  end

  # The relief's reading, asked once the page is up (it calls the region's
  # elevation service).
  def reading
    render json: { reading: @trial.reading! }
  end

  # A click: adds or removes the parcel there.
  def parcel
    return render json: { message: t("map_data.parcels.errors.unavailable") }, status: :not_found unless @trial.cadastre
    unless @trial.toggle_parcel(Float(params[:lng]), Float(params[:lat]))
      return render json: { message: t("map_data.parcels.nothing_here") }, status: :not_found
    end
    render json: { trial: @trial.as_inertia }
  rescue MapTrial::LimitReached
    render json: { message: t("trials.errors.too_many_parcels", count: MapTrial::MAX_PARCELS) }, status: :unprocessable_entity
  rescue ArgumentError, TypeError
    render json: { message: t("map_data.identify.invalid") }, status: :unprocessable_entity
  rescue Providers::GeoHttp::Error
    render json: { message: t("map_data.parcels.errors.unreachable") }, status: :service_unavailable
  end

  # « Garder ce carnet »: signed in, it becomes a map now. Otherwise, with
  # an e-mail typed on the trial, one gesture: the account is made and a
  # sign-in link (and its code) is sent, which comes back here, where #show
  # keeps it, on this device or another. Without one, the visitor signs up
  # on the usual page (Google, Apple…) and comes back the same way.
  def keep
    return adopt(Current.user) if authenticated?

    session[:pending_trial] = @trial.token
    session[:return_to_after_authenticating] = trial_url(@trial.token)
    return redirect_to new_session_path, notice: t("trials.sign_in_first") if params[:email_address].blank?

    user = @trial.claim!(params[:email_address])
    code = user.issue_sign_in_code!
    MagicLinkMailer.sign_in(user, code:, sent_at: user.sign_in_code_sent_at, return_to: trial_path(@trial.token)).deliver_later
    track_event("trial_keep_email", from: @trial.origin)
    redirect_to trial_path(@trial.token, sent: 1)
  rescue ActiveRecord::RecordInvalid
    redirect_to trial_path(@trial.token), alert: t("sessions.invalid_email")
  end

  def geocode
    geocoder = Providers::Geocoder.build
    return render json: { available: false, results: [] } unless geocoder.available?
    render json: { available: true, results: geocoder.search(params[:q].to_s.first(200), region: Region.default).map(&:as_json) }
  rescue Providers::Geocoder::Unavailable => error
    Rails.logger.info("[geocode] #{error.message}")
    render json: { available: true, message: t("map_data.geocode.unavailable"), results: [] }, status: :service_unavailable
  end

  private
    def set_trial
      @trial = MapTrial.find_by(token: params[:token].to_s)
      return if @trial&.live?
      # Kept already: its owner goes to the map.
      return redirect_to(map_path(@trial.adopted_map)) if @trial&.adopted_map && authenticated? && @trial.adopted_map.owner_id == Current.user.id

      respond_to do |format|
        format.json { render json: { message: t("trials.errors.expired") }, status: :gone }
        format.any { redirect_to new_trial_path, alert: t("trials.errors.expired") }
      end
    end

    def adopt(user)
      session.delete(:pending_trial)
      map = @trial.adopt!(user)
      track_event("trial_keep", from: @trial.origin)
      redirect_to map_path(map, terrain: map.boundary ? nil : "parcels"), notice: t("trials.kept", map: map.name)
    rescue MapTrial::LimitReached
      redirect_to maps_path, alert: t("maps.errors.plan_limit")
    end

    def source_publication
      token = params[:from].to_s
      return nil unless token.match?(/\A#{MapPublication::TOKEN_PATTERN}\z/)
      MapPublication.includes(:map).find_by(token:)&.then { |p| p.live? ? p : nil }
    end

    def remember_source(publication)
      session[:source_publication_id] = publication.id if publication
    end

    # The region's own knowledge, named for the visitor: its data layers,
    # never a sensitive one, never the base maps or the cadastre.
    def region_knowledge(catalogue)
      catalogue.reject { |l| l.category == "base" || l.role == "cadastre" || Collab::PublicSnapshot.sensitive_region_layer?(l) }
        .map(&:name).uniq.first(8)
    end
end

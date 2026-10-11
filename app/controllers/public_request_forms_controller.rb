# A professional's public request form (/demande/:slug, RequestForm): no
# account. The prospect finds their place, picks their parcels on the
# cadastre, answers a few questions and sends; the account's people get a
# ProjectRequest. Its own narrow endpoints for the map (region, parcel under
# a click, address search), rate limited per address.
class PublicRequestFormsController < ApplicationController
  allow_unauthenticated_access
  before_action { response.set_header("X-Robots-Tag", "noindex, nofollow") }
  before_action :set_form
  rate_limit to: 60, within: 1.minute, only: %i[locate parcel geocode],
    with: -> { render json: { message: t("request_forms.public.errors.rate_limited") }, status: :too_many_requests }
  rate_limit to: 5, within: 10.minutes, only: :create,
    with: -> { render json: { message: t("request_forms.public.errors.rate_limited") }, status: :too_many_requests }

  def show
    region = Region.europe || Region.default
    render inertia: "public_request_forms/show", props: {
      slug: @form.slug,
      account: @form.display_name,
      intro: @form.intro,
      region: region.as_inertia,
      layers: region.catalogue.enabled.bases.map(&:as_inertia),
      schema: ProjectRequest.answers_schema,
      maxPhotos: ProjectRequest::MAX_PHOTOS,
      maxParcels: ProjectRequests::Submit::MAX_PARCELS
    }
  end

  # The region of a place, its base maps and its cadastre layer (shown over
  # the photo so the parcels can be picked).
  def locate
    region = Region.for_point(Float(params[:lng]), Float(params[:lat]))
    catalogue = region.catalogue.enabled
    cadastre = catalogue.detect { |l| l.role == "cadastre" }
    render json: {
      region: region.as_inertia,
      layers: [ *catalogue.bases, cadastre ].compact.uniq.map(&:as_inertia),
      cadastre: cadastre&.key,
      parcels: Providers::Cadastre.for(region).present?
    }
  rescue ArgumentError, TypeError
    render json: { message: t("map_data.locate.invalid") }, status: :unprocessable_entity
  end

  def parcel
    lng, lat = Float(params[:lng]), Float(params[:lat])
    cadastre = Providers::Cadastre.for(Region.for_point(lng, lat))
    return render json: { message: t("map_data.parcels.errors.unavailable") }, status: :not_found unless cadastre
    found = cadastre.parcel_at(lng, lat)
    return render json: { message: t("map_data.parcels.nothing_here") }, status: :not_found unless found
    render json: { parcel: found }
  rescue ArgumentError, TypeError
    render json: { message: t("map_data.identify.invalid") }, status: :unprocessable_entity
  rescue Providers::GeoHttp::Error
    render json: { message: t("map_data.parcels.errors.unreachable") }, status: :service_unavailable
  end

  def geocode
    geocoder = Providers::Geocoder.build
    return render json: { available: false, results: [] } unless geocoder.available?
    region = Region.active.find_by(id: params[:region_id]) || Region.default
    render json: { available: true, results: geocoder.search(params[:q].to_s.first(200), region:).map(&:as_json) }
  rescue Providers::Geocoder::Unavailable => error
    Rails.logger.info("[geocode] #{error.message}")
    render json: { available: true, message: t("map_data.geocode.unavailable"), results: [] }, status: :service_unavailable
  end

  # multipart: `payload` (JSON: name, email, phone, address, message,
  # answers, center, parcels), `photos[]`, and `website`, a field people
  # never see: a robot that fills it is thanked and forgotten.
  def create
    return render(json: { ok: true }) if params[:website].present?
    payload = JSON.parse(params[:payload].to_s)
    return render_invalid({}) unless payload.is_a?(Hash)
    photos = Array(params[:photos]).select { _1.respond_to?(:content_type) }
    ProjectRequests::Submit.new(@form, payload.with_indifferent_access, photos:).call
    render json: { ok: true }, status: :created
  rescue JSON::ParserError
    render_invalid({})
  rescue ProjectRequests::Submit::Invalid => error
    render_invalid(error.errors)
  end

  private
    def set_form
      @form = RequestForm.active.find_by(slug: params[:slug].to_s)
      return if @form && owner_may_receive?
      respond_to do |format|
        format.json { render json: { message: t("request_forms.public.gone.title") }, status: :not_found }
        format.any { render inertia: "public_request_forms/gone", props: {}, status: :not_found }
      end
    end

    # A professional's form closes with their plan; a team's stays open.
    def owner_may_receive?
      @form.team? || (@form.owner.professional? && Entitlements.for(@form.owner).offers?)
    end

    def render_invalid(errors)
      render json: { errors:, message: t("request_forms.public.errors.invalid") }, status: :unprocessable_entity
    end
end

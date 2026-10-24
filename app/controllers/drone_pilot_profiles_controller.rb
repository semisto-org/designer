# « Mon profil de pilote »: any user who flies a drone applies to be listed
# in the directory, then keeps their profile up to date (fleet, price,
# travel fees, area). Semisto approves the application in
# /admin/drone-pilots. Once approved, the pilot opens their Stripe account
# (Stripe Connect) to be paid; Terranova keeps only its id.
class DronePilotProfilesController < ApplicationController
  before_action :set_pilot, only: %i[update stripe stripe_return]

  def show
    pilot = Current.user.drone_pilot
    render inertia: "drone_pilot_profiles/show", props: {
      pilot: pilot && profile_json(pilot),
      catalogue: { drones: DroneCatalog::DRONES.transform_values(&:itself), dataTypes: DroneCatalog::DATA_TYPES,
                   photogrammetry: DroneCatalog::PHOTOGRAMMETRY, certificates: DroneCatalog::CERTIFICATES,
                   legalForms: DronePilot::LEGAL_FORMS, countries: DronePilot::COUNTRIES },
      defaults: { displayName: Current.user.display_name, legalName: Current.user.name },
      commissionPercent: (DroneMission::COMMISSION_RATE * 100).round,
      vatRates: DronePilot::VAT_RATES, commissionVatRates: DroneMission::COMMISSION_VAT_RATES,
      travelCentsPerKm: DronePilot::TRAVEL_CENTS_PER_KM,
      paymentsOpen: Billing.enabled?
    }
  end

  def create
    return redirect_to(drone_pilot_profile_path) if Current.user.drone_pilot
    pilot = Current.user.build_drone_pilot(status: "pending")
    save(pilot, notice: t("drone_pilots.profile.applied"))
  end

  def update
    @pilot.resubmit! if params.dig(:drone_pilot, :resubmit).present?
    save(@pilot, notice: t("drone_pilots.profile.saved"))
  end

  # Opens the Stripe page where the pilot sets up or reviews their account.
  def stripe
    return redirect_to(drone_pilot_profile_path, alert: t("drone_pilots.profile.stripe_off")) unless Billing.enabled?
    return redirect_to(drone_pilot_profile_path, alert: t("drone_pilots.profile.stripe_not_approved")) unless @pilot.approved?
    url = DronePilots::StripeOnboarding.new(@pilot).url(refresh_url: stripe_drone_pilot_profile_url, return_url: stripe_return_drone_pilot_profile_url)
    redirect_to url, allow_other_host: true
  rescue Providers::StripeGateway::Error => e
    Rails.error.report(e, handled: true)
    redirect_to drone_pilot_profile_path, alert: t("drone_pilots.profile.stripe_error")
  end

  # Back from Stripe: reads the account at once (the webhook may come later).
  def stripe_return
    DronePilots::StripeOnboarding.new(@pilot).refresh! if Billing.enabled?
    redirect_to drone_pilot_profile_path, notice: t(@pilot.payouts_enabled? ? "drone_pilots.profile.stripe_ready" : "drone_pilots.profile.stripe_pending")
  rescue Providers::StripeGateway::Error => e
    Rails.error.report(e, handled: true)
    redirect_to drone_pilot_profile_path, alert: t("drone_pilots.profile.stripe_error")
  end

  private
    def set_pilot
      @pilot = Current.user.drone_pilot or redirect_to(drone_pilot_profile_path)
    end

    def save(pilot, notice:)
      attrs = pilot_params
      pilot.assign_attributes(attrs.except(:lng, :lat, :drones))
      pilot.drones = Array(attrs[:drones]).map { |d| { "model" => d[:model].to_s, "name" => d[:name].to_s.squish.presence }.compact } if attrs.key?(:drones)
      pilot.place_at!(attrs[:lng], attrs[:lat]) if attrs.key?(:lng)
      if pilot.save
        redirect_to drone_pilot_profile_path, notice:
      else
        redirect_to drone_pilot_profile_path, inertia: { errors: field_errors(pilot) }
      end
    end

    def pilot_params
      raw = params.require(:drone_pilot).permit(
        :display_name, :bio, :base_place, :lng, :lat, :service_radius_km, :mission_price, :travel_fees_enabled,
        :operator_number, :insurer, :phone, :legal_form, :legal_name, :business_number, :vat_number, :charges_vat, :tax_number,
        :address, :country, :birth_date, data_types: [], certificates: [], drones: %i[model name]
      )
      raw[:mission_price_cents] = (BigDecimal(raw.delete(:mission_price).to_s.tr(",", ".")) * 100).round if raw[:mission_price].present?
      raw[:data_types] = Array(raw[:data_types]) & DroneCatalog::DATA_TYPES if raw.key?(:data_types)
      raw
    rescue ArgumentError
      raw.except(:mission_price)
    end

    def profile_json(pilot)
      {
        id: pilot.id, status: pilot.status, reviewNote: pilot.review_note, listed: pilot.listed?,
        displayName: pilot.display_name, bio: pilot.bio, basePlace: pilot.base_place, lng: pilot.longitude, lat: pilot.latitude,
        serviceRadiusKm: pilot.service_radius_km, missionPriceCents: pilot.mission_price_cents, travelFeesEnabled: pilot.travel_fees_enabled,
        drones: pilot.drones, dataTypes: pilot.data_types, certificates: pilot.certificates,
        operatorNumber: pilot.operator_number, insurer: pilot.insurer, phone: pilot.phone,
        legalForm: pilot.legal_form, legalName: pilot.legal_name, businessNumber: pilot.business_number, vatNumber: pilot.vat_number,
        chargesVat: pilot.charges_vat, taxNumber: pilot.tax_number, address: pilot.address, country: pilot.country, birthDate: pilot.birth_date&.iso8601,
        stripeConnected: pilot.stripe_account_id.present?, payoutsEnabled: pilot.payouts_enabled, detailsSubmitted: pilot.details_submitted,
        missions: { waiting: pilot.missions.where(status: "requested").count, open: pilot.missions.open.count }
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

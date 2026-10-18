# Super admin « Codes promo »: make Stripe promotion codes (for beta testers,
# a partner, a course) and switch them off, without opening the Stripe
# dashboard. Checkout already accepts promotion codes, and each payment
# records the code it used (BillingPayment#promotion_code), counted here.
# Admins only (anyone else gets a 404). Without Stripe the page says so.
module Admin
  class PromoCodesController < BaseController
    PAGE_SIZE = 100

    def index
      render inertia: "admin/promo_codes/index", props: {
        stripeEnabled: Billing.enabled?,
        plans: plans,
        suggestedCode: Billing::PromoCodeForm.suggested_code,
        defaultPlanKeys: Billing::PromoCodeForm::DEFAULT_PLAN_KEYS & Billing::PromoCodeForm.configured_plan_keys,
        **listing
      }
    end

    def create
      return refuse(t("admin_promo_codes.flash.disabled")) unless Billing.enabled?
      form = Billing::PromoCodeForm.new(form_params)
      return redirect_to(admin_promo_codes_path, inertia: { errors: form.errors }, status: :see_other) unless form.valid?

      promotion_code = form.issue!(gateway, by: Current.user)
      AdminEvent.record!("promotion_code_created", admin: Current.user, request:,
        code: promotion_code["code"], promotion_code_id: promotion_code["id"])
      redirect_to admin_promo_codes_path, notice: t("admin_promo_codes.flash.created", code: promotion_code["code"]), status: :see_other
    rescue Providers::StripeGateway::Error => e
      Rails.error.report(e, handled: true)
      redirect_to admin_promo_codes_path, inertia: { errors: stripe_errors(e) }, status: :see_other
    end

    # « Désactiver »: nobody can type the code any more; past payments stay.
    def deactivate
      return refuse(t("admin_promo_codes.flash.disabled")) unless Billing.enabled?
      promotion_code = gateway.update_promotion_code(params[:id], { active: false })
      AdminEvent.record!("promotion_code_deactivated", admin: Current.user, request:,
        code: promotion_code["code"], promotion_code_id: promotion_code["id"])
      redirect_back_or_to admin_promo_codes_path, notice: t("admin_promo_codes.flash.deactivated", code: promotion_code["code"]),
        status: :see_other
    rescue Providers::StripeGateway::Error => e
      Rails.error.report(e, handled: true)
      refuse t("admin_promo_codes.errors.stripe", message: e.message)
    end

    private
      def gateway = @gateway ||= Providers::StripeGateway.new

      def form_params
        params.require(:promo_code).permit(:code, :discount_type, :percent_off, :amount_off, :duration, :duration_in_months,
          :max_redemptions, :expires_on, :first_time_only, :note, plan_keys: [])
      end

      def plans
        Billing::PromoCodeForm::PLAN_KEYS.map do |key|
          plan = Billing::Catalog.find(key)
          { key:, subscription: plan&.subscription? || false, configured: Billing.price_id(key).present? }
        end
      end

      # The promotion codes from Stripe (100 at a time, latest first) and how
      # many recorded payments used each one.
      def listing
        return { codes: [], hasMore: false, listError: nil } unless Billing.enabled?
        list = gateway.list_promotion_codes(limit: PAGE_SIZE, starting_after: params[:after].presence)
        data = Array(list["data"])
        counts = BillingPayment.where(promotion_code: data.map { |code| code["code"] }).group(:promotion_code).count
        {
          codes: data.map { |code| Billing::PromoCodeForm.row(code, payments_count: counts[code["code"]].to_i) },
          hasMore: list["has_more"] == true, nextAfter: (data.last && data.last["id"]),
          after: params[:after].presence, listError: nil
        }
      rescue Providers::StripeGateway::Error => e
        Rails.error.report(e, handled: true)
        { codes: [], hasMore: false, listError: e.message }
      end

      # Stripe's refusals, in French, on the field they concern.
      def stripe_errors(error)
        if error.code == "resource_already_exists" || error.message.to_s.match?(/already exists/i)
          { code: t("admin_promo_codes.errors.code_taken") }
        else
          { base: t("admin_promo_codes.errors.stripe", message: error.message) }
        end
      end

      def refuse(message)
        redirect_back_or_to admin_promo_codes_path, alert: message, status: :see_other
      end
  end
end

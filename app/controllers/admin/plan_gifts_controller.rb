# « Offrir une formule »: plans Semisto gives away (Billing::PlanGift), to one
# account from the accounts list or to every account created before a date
# that is on the free plan. A gift can be taken back; a plan paid on invoice
# cannot be revoked from here.
module Admin
  class PlanGiftsController < BaseController
    def create
      user = User.find(params[:user_id])
      grant = gift.give(user)
      AdminEvent.record!("plan_gifted", admin: Current.user, target: user, request:, plan: params[:plan_key], ends_on: params[:ends_on]) if grant
      done t(grant ? "admin.plan_gifts.flash.given" : "admin.plan_gifts.flash.already", name: user.display_name, plan: plan_name, date: date)
    rescue Billing::PlanGift::Error, ArgumentError, TypeError
      refuse
    end

    # Every account created before the given date (the day itself excluded)
    # that is on the free plan.
    def create_all
      before = Date.iso8601(params[:created_before].to_s).in_time_zone.beginning_of_day
      count = gift.give_all(created_before: before)
      AdminEvent.record!("plans_gifted", admin: Current.user, request:, plan: params[:plan_key], ends_on: params[:ends_on],
        created_before: params[:created_before], count:, label: t("admin.plan_gifts.event_label", count:, plan: plan_name))
      done t("admin.plan_gifts.flash.given_all", count:, plan: plan_name, date: date)
    rescue Billing::PlanGift::Error, ArgumentError, TypeError
      refuse
    end

    def revoke
      grant = PlanGrant.find(params[:id])
      return refuse if grant.on_invoice?
      grant.revoke!
      AdminEvent.record!("plan_gift_revoked", admin: Current.user, target: grant.user, request:, plan: grant.plan_key)
      done t("admin.plan_gifts.flash.revoked", name: grant.user.display_name)
    end

    private
      def gift
        Billing::PlanGift.new(plan_key: params[:plan_key].to_s, ends_on: Date.iso8601(params[:ends_on].to_s), by: Current.user)
      end

      def plan_name = t("billing.plans.#{params[:plan_key]}.name")
      def date = Billing::FrenchDate.long(Date.iso8601(params[:ends_on].to_s))

      def done(message)
        redirect_back_or_to admin_users_path, notice: message, status: :see_other
      end

      def refuse
        redirect_back_or_to admin_users_path, alert: t("admin.plan_gifts.errors.invalid"), status: :see_other
      end
  end
end

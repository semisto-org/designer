# /account — who I am, my plan, and the request to delete my account.
class AccountsController < ApplicationController
  rate_limit to: 3, within: 1.hour, only: :deletion_request, with: -> { redirect_to account_path, alert: t("account.rate_limited") }

  def show
    user = Current.user
    plan = user.current_plan_key
    render inertia: "accounts/show", props: {
      account: {
        name: user.name, email: user.email_address, avatarUrl: user.avatar_url, signedUpAt: user.created_at.iso8601,
        googleLinked: user.google_uid.present?,
        plan:,
        planEndsAt: plan_ends_at(user, plan)&.iso8601,
        ownedMaps: user.owned_maps.active.count,
        maxMaps: user.entitlements.max_maps,
        readOnlyMaps: user.read_only_maps_count
      }
    }
  end

  def update
    if Current.user.update(params.require(:user).permit(:name))
      redirect_to account_path, notice: t("account.saved")
    else
      redirect_to account_path, inertia: { errors: Current.user.errors }
    end
  end

  # No hard delete in v1: Semisto handles the request by hand (payment records
  # must be kept; maps are archived or exported first).
  def deletion_request
    AccountMailer.deletion_request(Current.user).deliver_later
    AccountMailer.deletion_confirmation(Current.user).deliver_later
    redirect_to account_path, notice: t("account.deletion_sent")
  end

  private
    # When the current plan stops unless renewed: the yearly pass or the plan
    # given on invoice (PlanGrant), whichever lasts longer. None for a
    # subscription, which renews by itself.
    def plan_ends_at(user, plan)
      return nil if user.current_plan_subscription&.plan_key == plan
      ends = user.plan_grants.active_at(Time.current).where(plan_key: plan).pluck(:ends_at)
      ends << user.current_yearly_pass&.expires_at if plan == "yearly"
      ends.compact.max
    end
end

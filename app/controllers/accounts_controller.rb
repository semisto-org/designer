# /account — who I am, my plan, and the request to delete my account.
class AccountsController < ApplicationController
  rate_limit to: 3, within: 1.hour, only: :deletion_request, with: -> { redirect_to account_path, alert: t("account.rate_limited") }

  def show
    user = Current.user
    subscription = user.current_plan_subscription
    pass = user.current_yearly_pass
    render inertia: "accounts/show", props: {
      account: {
        name: user.name, email: user.email_address, avatarUrl: user.avatar_url, signedUpAt: user.created_at.iso8601,
        googleLinked: user.google_uid.present?,
        plan: user.current_plan_key,
        passExpiresAt: pass&.expires_at&.iso8601,
        subscriptionPlan: subscription&.plan_key,
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
end

# /account — who I am, my plan, and the request to delete my account.
class AccountsController < ApplicationController
  forbid_while_impersonating only: %i[update deletion_request]
  rate_limit to: 3, within: 1.hour, only: :deletion_request, with: -> { redirect_to account_path, alert: t("account.rate_limited") }

  def show
    user = Current.user
    plan = user.current_plan_key
    render inertia: "accounts/show", props: {
      account: {
        name: user.name, email: user.email_address, avatarUrl: user.avatar_url, hasOwnAvatar: user.avatar.attached?, logoUrl: user.logo_url, signedUpAt: user.created_at.iso8601,
        googleLinked: user.google_uid.present?,
        appleLinked: user.apple_uid.present?,
        hasPassword: user.password?,
        accountKind: user.account_kind,
        vatNumber: user.vat_number,
        plan:,
        planEndsAt: plan_ends_at(user, plan)&.iso8601,
        ownedMaps: user.billed_maps.count,
        maxMaps: user.entitlements.max_maps,
        readOnlyMaps: user.read_only_maps_count,
        # Once they pay for a team, the plan covers the team's maps and their
        # own maps follow the free plan apart (Billing::Scope).
        personalMaps: (personal_maps(Billing::Scope.own(user)) if user.pays_for_teams?),
        # « Aider à améliorer Terranova »: the beta's session recording (SessionReplayConsent).
        replay: { enabled: SessionReplay.enabled?, consent: user.replay_consent, sessions: user.session_replays.count, perUser: SessionReplay.per_user }
      }
    }
  end

  def update
    if Current.user.update(params.require(:user).permit(:name, :account_kind, :vat_number))
      redirect_to account_path, notice: saved_notice
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
    def personal_maps(scope) = { used: scope.maps.count, max: scope.entitlements.max_maps }

    def saved_notice
      return t("account.kind.saved") if params[:user].key?(:account_kind)
      return t("billing.vat_number.saved") if params[:user].key?(:vat_number)
      t("account.saved")
    end

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

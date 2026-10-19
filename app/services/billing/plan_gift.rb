module Billing
  # Plans Semisto gives away: a PlanGrant with no invoice behind it. Given to
  # one account from the admin accounts list, or to every account created
  # before a date that is on the free plan, so the people who tried Terranova
  # before payments opened keep their maps editable. It counts like any
  # grant (PlanResolver) and ends like one: reminders before the end, then
  # maps beyond the free limit become read-only, nothing is deleted.
  class PlanGift
    PLAN_KEYS = PlanGrant::PLAN_KEYS

    Error = Class.new(StandardError)

    # The grant ends at the start of the day after `ends_on`, in the app's
    # time zone, so « jusqu'au 31 mars » includes the 31st.
    def self.ends_at(ends_on) = (ends_on + 1).in_time_zone.beginning_of_day

    def initialize(plan_key:, ends_on:, by:, at: Time.current)
      raise Error, "unknown plan #{plan_key.inspect}" unless PLAN_KEYS.include?(plan_key)
      @plan_key = plan_key
      @ends_at = self.class.ends_at(ends_on)
      raise Error, "the end date is past" unless @ends_at > at
      @by = by
      @at = at
    end

    # The grant made, or nil when the user already has this plan given for
    # at least as long (so giving twice changes nothing).
    def give(user)
      return nil if covered?(user)
      user.plan_grants.create!(plan_key: @plan_key, starts_at: @at, ends_at: @ends_at, granted_by: @by,
        notes: I18n.t("admin.plan_gifts.note", locale: :fr))
    end

    # Gives the plan to every account created before `created_before` that is
    # on the free plan right now. Accounts on a paid plan are left alone.
    # Returns the number of grants made.
    def give_all(created_before:)
      User.where(created_at: ...created_before).find_each.count do |user|
        user.current_plan_key(at: @at) == "free" && give(user).present?
      end
    end

    private
      def covered?(user)
        user.plan_grants.not_revoked.where(plan_key: @plan_key).where(ends_at: @ends_at..).exists?
      end
  end
end

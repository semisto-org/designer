# The figures of the super admin dashboard: accounts, maps, activity, plans
# and payments, and what waits on Semisto. A handful of COUNT queries; the
# plan of each paying account is resolved one by one (there are few).
module Admin
  class Stats
    WEEKS = 12

    def self.call(at: Time.current) = new(at).as_json

    def initialize(at)
      @at = at
    end

    def as_json(*)
      { users:, maps:, activity:, plans:, revenue:, inbox:, signupsByWeek: signups_by_week, mapsByRegion: maps_by_region }
    end

    private
      def users
        { total: User.count, new7d: User.where(created_at: (@at - 7.days)..).count, new30d: User.where(created_at: (@at - 30.days)..).count,
          active30d: User.where(last_signed_in_at: (@at - 30.days)..).count, admins: User.where(admin: true).count,
          inTeams: OrganizationMembership.distinct.count(:user_id) }
      end

      def maps
        { total: Map.active.count, new30d: Map.active.where(created_at: (@at - 30.days)..).count, archived: Map.where.not(archived_at: nil).count,
          published: MapPublication.where(unpublished_at: nil).distinct.count(:map_id), teams: Organization.count,
          areaHa: (Map.active.sum(:area_m2).to_f / 10_000).round(1) }
      end

      def activity
        since = @at - 30.days
        { features: MapFeature.count, features30d: MapFeature.where(created_at: since..).count,
          aiDrafts: MapFeature.drafts.count, aiActions30d: AiAction.where(created_at: since..).count,
          aiUsers30d: AiAction.where(created_at: since..).distinct.count(:user_id),
          comments30d: Comment.where(created_at: since.., deleted_at: nil).count }
      end

      # Accounts on each paid plan right now (everyone else is on « free »).
      def plans
        ids = PlanPurchase.valid_at(@at).pluck(:user_id) | PlanSubscription.granting_access(@at).pluck(:user_id) |
          PlanGrant.active_at(@at).pluck(:user_id)
        counts = User.where(id: ids).map { |user| user.current_plan_key(at: @at) }.tally
        { billingEnabled: Billing.enabled?, paying: counts.except("free").values.sum, byPlan: counts.except("free") }
      end

      def revenue
        payments = BillingPayment.live
        { year: net_cents(payments.between(@at.beginning_of_year, @at)), last30d: net_cents(payments.between(@at - 30.days, @at)),
          total: net_cents(payments), count: payments.count }
      end

      def net_cents(scope) = scope.sum(:amount_cents) - scope.sum(:refunded_cents)

      def inbox
        { serviceRequests: ServiceRequest.pending.count, invoiceRequests: InvoiceRequest.pending.count }
      end

      def signups_by_week
        start = (@at - (WEEKS - 1).weeks).beginning_of_week
        counts = User.where(created_at: start..@at).group(Arel.sql("date_trunc('week', users.created_at)")).count
          .transform_keys { |time| time.to_date }
        (0...WEEKS).map do |index|
          week = (start + index.weeks).to_date
          { week: week.iso8601, count: counts[week].to_i }
        end
      end

      def maps_by_region
        Map.active.joins(:region).group("regions.name").order(Arel.sql("COUNT(*) DESC")).count
          .map { |name, count| { region: name, count: } }
      end
  end
end

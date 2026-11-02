module Mcp
  module Tools
    # What the connected person's plan does for their places, as on the top
    # of « Formule et facturation » (BillingPlaces): which places it covers
    # (read-only ones marked), the counters (active maps, storage, this
    # month's images), when it ends or renews, and what happens if they stop.
    # Read only: changing plan stays on the website.
    class GetMyPlan < Base
      arguments(properties: {})
      hints

      def perform
        at = Time.current
        places = BillingPlaces.new(user).as_json
        entitlements = Billing::Scope.new(user).entitlements
        storage = StorageUsage.new(user)
        plan = user.current_plan_key(at:)
        {
          plan: { key: plan, name: I18n.t("billing.plans.#{plan}.name") },
          billing_open: Billing.enabled?,
          renewal: renewal(at),
          includes: {
            max_active_maps: entitlements.max_maps, storage_bytes: entitlements.storage_bytes,
            renderings_per_month: entitlements.renderings_per_month, pdf_export: entitlements.pdf_export?,
            analyses: entitlements.analyses?, ai_drafts: entitlements.ai_drafts?, offers: entitlements.offers?
          },
          usage: {
            active_maps: places[:activeCount], archived_maps: places[:archivedCount],
            storage_used_bytes: storage.used_bytes,
            renderings_this_month: places.dig(:renderings, :used), renderings_reset_on: at.next_month.beginning_of_month.to_date.iso8601
          },
          places: places[:maps].map { |map| { id: map[:id], name: map[:name], read_only: map[:readOnly], area_m2: map[:areaM2], url: "#{origin}/maps/#{map[:id]}" } },
          paid_teams: user.paid_teams.order(:name).map { |team| { id: team.id, name: team.name } },
          # Where a new map fits now: own maps, or a team (a paid team has its own room).
          new_map_room: Billing::NewMapSpaces.new(user).all.map do |space|
            { space: space.team ? "team" : "own", team_id: space.team_id, team_name: space.team&.name, can_create: space.can_create? }
          end,
          if_i_stop: plan == "free" ? nil : {
            stays_editable: places[:keptOnFree],
            become_read_only: [ places[:activeCount] - places[:freeMaxMaps], 0 ].max,
            free_storage_bytes: places[:freeStorageBytes],
            nothing_deleted: true
          },
          plans_url: "#{origin}/billing"
        }
      end

      private
        def renewal(at)
          if (subscription = user.latest_plan_subscription)&.grants_access?
            { kind: subscription.cancel_at_period_end ? "ends" : "renews_automatically", on: subscription.current_period_end&.to_date&.iso8601 }
          elsif (pass = user.current_yearly_pass(at:))
            { kind: "ends_unless_renewed", on: pass.expires_at.to_date.iso8601, days_left: pass.days_left(at) }
          elsif (grant = user.plan_grants.current_or_upcoming(at).order(:starts_at).find { _1.active?(at) })
            { kind: "ends_unless_renewed", on: grant.ends_at.to_date.iso8601 }
          end
        end

        def summarize_result(data) = { places: data[:places].size }
    end
  end
end

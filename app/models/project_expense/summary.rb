class ProjectExpense
  # A project's expenses at a glance: what each payer carries, and each
  # group (plants, supplies, other) against what the accepted offer planned
  # for it, before VAT. The offer's plants and supplies come from its plant
  # estimate (base scope, margin included); « other » from the expense lines
  # of its phases (soil analysis, printing…), trips left out since the hours
  # side counts them in kilometres.
  class Summary
    GROUPS = %w[plants supplies other].freeze

    attr_reader :map, :expenses

    def initialize(map, expenses: map.project_expenses.to_a, version: TimeEntry::Envelopes.accepted_version(map))
      @map = map
      @expenses = expenses
      @version = version
    end

    def by_payer
      ProjectExpense::PAYERS.filter_map do |payer|
        mine = expenses.select { _1.paid_by == payer }
        next if mine.empty?
        { paidBy: payer, amountCents: mine.sum(&:amount_cents), totalCents: mine.sum(&:total_cents), count: mine.size }
      end
    end

    def by_group
      GROUPS.map do |group|
        mine = expenses.select { _1.offer_group == group }
        planned = planned_cents(group)
        spent = mine.sum(&:amount_cents)
        { group:, amountCents: spent, plannedCents: planned, overCents: planned && spent > planned ? spent - planned : nil }
      end.reject { _1[:amountCents].zero? && _1[:plannedCents].to_i.zero? }
    end

    def totals
      { amountCents: expenses.sum(&:amount_cents), vatCents: expenses.sum(&:vat_cents), totalCents: expenses.sum(&:total_cents),
        plannedCents: @version ? GROUPS.sum { planned_cents(_1).to_i } : nil }
    end

    def as_json(*) = { byPayer: by_payer, byGroup: by_group, totals: }

    private
      def planned_cents(group)
        return nil unless @version
        result = @version.result || {}
        euros =
          case group
          when "plants" then result.dig("plants", "plants_base")
          when "supplies" then result.dig("plants", "supplies_base")
          else
            Array(result["phases"]).reject { _1["enabled"] == false }.sum do |phase|
              Array(phase["expenses"]).reject { _1["kind"] == "trip" || _1["disabled"] || _1["option"] }.sum { _1["amount"].to_f }
            end
          end
        (euros.to_f * 100).round
      end
  end
end

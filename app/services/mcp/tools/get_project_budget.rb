module Mcp
  module Tools
    # « Budget du projet »: the four items of a project's budget (services,
    # expenses, plants, implementation), each with what was budgeted (the
    # accepted offer, or a figure the team set by hand), what was done
    # (hours, expenses) and what was invoiced to the client, and the
    # invoices recorded. For the team that runs the project only; the client
    # never reads it here. Before VAT, in euros. Not accounting.
    class GetProjectBudget < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        raise ToolError, t("errors.time_not_allowed") unless TimeEntry.shown_to?(map, user)
        raise ToolError, t("errors.time_plan") unless TimeEntry.enabled_for?(map)
        invoices = map.project_invoices.includes(:user, document_attachment: :blob).chronological.to_a
        budget = ProjectBudget.new(map, invoices:)
        {
          map_id: map.id, url: "#{map_url(map)}/time_entries", offer_version: budget.version_json&.dig(:label),
          items: budget.items.map { self.class.item_json(_1) },
          totals: self.class.totals_json(budget.totals),
          invoices: invoices.reverse.map { self.class.invoice_json(_1) }
        }
      end

      def self.euros(cents) = cents&.then { _1 / 100.0 }

      def self.item_json(item)
        {
          item: item[:key], budget_eur: euros(item[:budgetCents]), budget_source: item[:budgetSource], offer_eur: euros(item[:offerCents]),
          invoiced_eur: euros(item[:invoicedCents]), left_to_invoice_eur: euros(item[:leftToInvoiceCents]), status: item[:status],
          spent_eur: euros(item[:spentCents]), hours_done: item.dig(:hours, :done), hours_envelope: item.dig(:hours, :envelope),
          km: item[:km], over_budget: item[:overBudget],
          plants_left_eur: euros(item.dig(:plantsLeft, :cents)), plants_left_count: item.dig(:plantsLeft, :count)
        }.compact
      end

      def self.totals_json(totals)
        {
          budget_eur: euros(totals[:budgetCents]), invoiced_eur: euros(totals[:invoicedCents]), vat_eur: euros(totals[:vatCents]),
          left_to_invoice_eur: euros(totals[:leftToInvoiceCents]), unpaid_eur: euros(totals[:unpaidCents]), invoices: totals[:invoices]
        }.compact
      end

      def self.invoice_json(invoice)
        {
          id: invoice.id, number: invoice.number, issued_on: invoice.issued_on.iso8601, paid_on: invoice.paid_on&.iso8601,
          items_eur: ProjectInvoice::ITEMS.index_with { euros(invoice.item_cents(_1)) }.reject { |_, v| v.zero? },
          amount_eur: euros(invoice.amount_cents), vat_eur: euros(invoice.vat_cents), total_eur: euros(invoice.total_cents),
          note: invoice.note, has_pdf: invoice.document.attached?, source: invoice.source
        }.compact
      end
    end
  end
end

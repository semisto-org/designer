module Mcp
  module Tools
    # Records the invoices a team sent its client, when the person gives
    # them to their AI (« la facture 2026-042 du 12 novembre : 1 800 € de
    # design, 240 € de frais »), or reads them off a PDF the person shared.
    # Written directly (it is the team's admin, not design), marked « Notée
    # par ton IA » in the project's « Budget du projet », where the team
    # adds the PDF, changes or deletes it. Never issues an invoice. For the
    # team that runs the project only. Each invoice is all or nothing.
    class RecordClientInvoices < Base
      MAX_INVOICES = 20

      requirement :write
      arguments(
        properties: {
          invoices: {
            type: "array", minItems: 1, maxItems: MAX_INVOICES, description: :client_invoices,
            items: {
              type: "object", additionalProperties: false, required: %w[map_id number issued_on items_eur],
              properties: {
                map_id: { type: "integer", minimum: 1, description: :map_id },
                number: { type: "string", minLength: 1, maxLength: 60, description: :invoice_number },
                issued_on: { type: "string", format: "date", description: :invoice_issued_on },
                paid_on: { type: "string", format: "date", description: :invoice_paid_on },
                items_eur: {
                  type: "object", additionalProperties: false, minProperties: 1, description: :invoice_items,
                  properties: ProjectInvoice::ITEMS.index_with { { type: "number", minimum: 0, maximum: ProjectInvoice::MAX_CENTS / 100 } }
                },
                vat_eur: { type: "number", minimum: 0, maximum: ProjectInvoice::MAX_CENTS / 100, description: :invoice_vat },
                note: { type: "string", maxLength: 1_000, description: :invoice_note }
              }
            }
          }
        },
        required: %w[invoices]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(invoices:)
        created = []
        rejected = []
        invoices.each_with_index do |line, index|
          line = line.to_h.deep_transform_keys(&:to_s)
          map = find_map!(line["map_id"])
          raise ToolError, t("errors.invoice_not_allowed") unless ProjectInvoice.writable_by?(map, user)
          invoice = map.project_invoices.new(attributes(line))
          if invoice.save
            created << invoice
          else
            rejected << { index:, error: invoice.errors.full_messages.to_sentence }
          end
        rescue ToolError => e
          rejected << { index:, error: e.message }
        end
        if created.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        {
          created: created.map { GetProjectBudget.invoice_json(_1).merge(map_id: _1.map_id) },
          rejected:, url: "#{map_url(created.first.map)}/time_entries", next_step: t("notes.invoices_written")
        }
      end

      private
        def attributes(line)
          cents = ProjectInvoice::ITEMS.index_with { (line.dig("items_eur", _1).to_f * 100).round }
          {
            user:, source: "mcp", number: line["number"], issued_on: line["issued_on"], paid_on: line["paid_on"], note: line["note"],
            **cents.transform_keys { :"#{_1}_cents" },
            vat_cents: line["vat_eur"] ? (line["vat_eur"].to_f * 100).round : ProjectInvoice.default_vat_cents(cents)
          }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end

module Mcp
  module Tools
    # Notes what a project cost besides time, when the person tells their AI
    # what they bought: « 40 m³ de broyat chez Dupont, 480 € HTVA, à
    # refacturer ». Written directly (like the hours), marked « Notée par ton
    # IA » in the project's « Temps et dépenses », where the team changes or
    # deletes it. The team notes any payer; the client (a viewer the team
    # shows the project to) only their own purchases. Each line is all or
    # nothing; a refused line comes back with its reason.
    class RecordProjectExpenses < Base
      MAX_LINES = 50

      requirement :write
      arguments(
        properties: {
          lines: {
            type: "array", minItems: 1, maxItems: MAX_LINES, description: :expense_lines,
            items: {
              type: "object", additionalProperties: false, required: %w[map_id spent_on label amount_eur category paid_by],
              properties: {
                map_id: { type: "integer", minimum: 1, description: :map_id },
                spent_on: { type: "string", format: "date", description: :expense_spent_on },
                label: { type: "string", minLength: 1, maxLength: 120, description: :expense_label },
                amount_eur: { type: "number", exclusiveMinimum: 0, maximum: ProjectExpense::MAX_CENTS / 100, description: :expense_amount },
                vat_rate: { type: "integer", enum: ProjectExpense::VAT_RATES, description: :expense_vat_rate },
                category: { type: "string", enum: ProjectExpense::CATEGORIES, description: :expense_category },
                paid_by: { type: "string", enum: ProjectExpense::PAYERS, description: :expense_paid_by },
                supplier: { type: "string", maxLength: 120, description: :expense_supplier },
                phase: { type: "string", enum: TimeEntry::PHASES, description: :time_phase },
                note: { type: "string", maxLength: 1_000, description: :expense_note }
              }
            }
          }
        },
        required: %w[lines]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(lines:)
        created = []
        rejected = []
        lines.each_with_index do |line, index|
          line = line.to_h.transform_keys(&:to_s)
          map = find_map!(line["map_id"])
          expense = map.project_expenses.new(attributes(line))
          raise ToolError, t("errors.expense_not_allowed") unless expense.writable_by?(user)
          if expense.save
            created << expense
          else
            rejected << { index:, error: expense.errors.full_messages.to_sentence }
          end
        rescue ToolError => e
          rejected << { index:, error: e.message }
        end
        if created.empty?
          raise ToolError, t("errors.nothing_written", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; "))
        end
        {
          created: created.map { { id: _1.id, map_id: _1.map_id, spent_on: _1.spent_on.iso8601, label: _1.label, amount_eur: _1.amount, vat_rate: _1.vat_rate, paid_by: _1.paid_by } },
          rejected:, url: "#{map_url(created.first.map)}/time_entries", next_step: t("notes.expenses_written")
        }
      end

      private
        def attributes(line)
          category = line["category"]
          {
            user:, source: "mcp", spent_on: line["spent_on"], label: line["label"], supplier: line["supplier"],
            amount_cents: (line["amount_eur"].to_f * 100).round, vat_rate: line["vat_rate"] || ProjectExpense.default_vat_rate(category),
            category:, paid_by: line["paid_by"], phase: line["phase"], note: line["note"]
          }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end

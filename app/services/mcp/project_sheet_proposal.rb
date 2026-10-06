module Mcp
  # Turns answers an AI gathered (in a conversation, from an interview
  # transcript…) into project sheet drafts: each answer is checked against
  # the sheet's schema and waits, with its rationale, for a human. A field
  # that already has an answer is never overwritten silently: the outcome
  # lists what each accepted draft would replace.
  class ProjectSheetProposal
    MAX_ANSWERS = 60

    Outcome = Data.define(:created, :unchanged, :rejected)

    def initialize(map:, user:, client_name: nil)
      @map = map
      @user = user
      @client_name = client_name
    end

    def call(answers)
      raise ToolError, I18n.t("mcp.errors.too_many_answers", max: MAX_ANSWERS) if answers.size > MAX_ANSWERS
      sheet = @map.project_sheet
      created = []
      unchanged = []
      rejected = []
      seen = Set.new
      answers.each_with_index do |answer, index|
        answer = answer.to_h.transform_keys(&:to_s)
        section, field = answer.values_at("section", "field").map(&:to_s)
        value, error = coerce(section, field, answer["value"])
        error ||= I18n.t("mcp.sheet_errors.duplicate", path: "#{section}.#{field}") unless seen.add?([ section, field ])
        if error
          rejected << { index:, section:, field:, error: }
          next
        end
        current = sheet.section(section)[field]
        if current == value
          unchanged << { index:, section:, field: }
          next
        end
        draft = @map.project_sheet_drafts.find_or_initialize_by(section:, field:)
        replaced_draft = draft.persisted?
        draft.assign_attributes(value:, rationale: answer["rationale"].to_s.strip, created_by: @user, client_name: @client_name)
        if draft.save
          created << { index:, draft:, replaces: TypedSchema.answered?(current) ? current : nil, replaced_draft: }
        else
          rejected << { index:, section:, field:, error: draft.errors.full_messages.to_sentence }
        end
      end
      @map.touch if created.any?
      Outcome.new(created:, unchanged:, rejected:)
    end

    private
      # [normalised value, nil] or [nil, error message].
      def coerce(section, field, raw)
        fields = ProjectSheet::SECTIONS[section]
        return [ nil, I18n.t("mcp.sheet_errors.section", sections: ProjectSheet::SECTIONS.keys.join(", ")) ] unless fields
        definition = fields.find { |f| f.key == field }
        return [ nil, I18n.t("mcp.sheet_errors.field", section:, fields: fields.map(&:key).join(", ")) ] unless definition
        parsed = ProjectSheet.parse({ section => { field => raw } })
        return [ nil, I18n.t("mcp.sheet_errors.value", details: describe(definition)) ] unless parsed.valid?
        value = parsed.section(section)[field]
        return [ nil, I18n.t("mcp.sheet_errors.blank") ] unless TypedSchema.answered?(value)
        [ value, nil ]
      end

      # What the field accepts, so the AI can correct itself.
      def describe(definition)
        case definition.type
        when :enum then I18n.t("mcp.sheet_errors.expects.enum", values: definition.values.join(", "))
        when :multi then I18n.t("mcp.sheet_errors.expects.multi", values: definition.values.join(", "))
        when :integer then I18n.t("mcp.sheet_errors.expects.integer", min: definition.range.begin, max: definition.range.end)
        when :text then I18n.t("mcp.sheet_errors.expects.text", limit: definition.limit)
        when :list then I18n.t("mcp.sheet_errors.expects.list", max: definition.max)
        else definition.type.to_s
        end
      end
  end
end

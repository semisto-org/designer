module Mcp
  module Tools
    # The project sheet of a map with its whole schema: every section and
    # field, its type, the allowed values with their French labels, the
    # current answer, the completion and the answers an AI already proposed.
    # What an AI needs to fill the sheet from a conversation or a transcript.
    class GetProjectSheet < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        sheet = map.project_sheet
        progress = sheet.progress
        {
          map_id: map.id,
          url: "#{map_url(map)}/project",
          percent: progress[:percent],
          next_section: progress[:nextSection],
          sections: ProjectSheet::SECTIONS.map { |key, fields| section_json(sheet, progress, key, fields) },
          pending_drafts: map.project_sheet_drafts.map { |d| { section: d.section, field: d.field, value: d.value, rationale: d.rationale } },
          note: t("notes.project_sheet")
        }
      end

      private
        def section_json(sheet, progress, key, fields)
          texts = "journey.project.sections.#{key}"
          {
            key:,
            title: I18n.t("#{texts}.title"),
            hint: I18n.t("#{texts}.hint", default: nil),
            percent: progress[:sections][key][:percent],
            done: sheet.done?(key),
            fields: fields.reject(&:hidden).map { |f| field_json(f, "#{texts}.fields.#{f.key}", sheet.section(key)[f.key]) }
          }.compact
        end

        def field_json(field, texts, value)
          {
            key: field.key,
            type: field.type.to_s,
            label: I18n.t("#{texts}.label", default: field.key),
            hint: I18n.t("#{texts}.hint", default: nil),
            unit: I18n.t("#{texts}.unit", default: nil),
            options: field.values&.index_with { |v| I18n.t("#{texts}.options.#{v}", default: v) },
            exclusive: field.exclusive.presence,
            range: field.range && [ field.range.begin, field.range.end ],
            max_length: field.type == :text ? field.limit : nil,
            max_entries: field.max,
            item: field.item&.reject(&:hidden)&.map { |i| field_json(i, "#{texts}.item.#{i.key}", nil).except(:value) },
            value:
          }.compact
        end

        def summarize_result(data) = { percent: data[:percent] }
    end
  end
end

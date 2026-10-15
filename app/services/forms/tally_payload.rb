module Forms
  # Reads a Tally webhook event (eventType FORM_RESPONSE) into what Designer
  # keeps: the form, the response's id and date, the map reference from the
  # hidden field « carte », and every answer as plain text, in the form's
  # order. Choices are written with their labels, files and signatures as
  # their names and links, a matrix row by row; empty answers are left out.
  class TallyPayload
    Field = Data.define(:label, :value)

    attr_reader :data

    def initialize(event)
      @event = event.is_a?(Hash) ? event : {}
      @data = @event["data"].is_a?(Hash) ? @event["data"] : {}
    end

    def response? = @event["eventType"] == "FORM_RESPONSE" && form_id.present? && response_id.present?

    def form_id = data["formId"].to_s.presence
    def form_name = data["formName"].to_s.squish.presence || form_id
    def response_id = (data["responseId"] || data["submissionId"]).to_s.presence

    def submitted_at
      Time.iso8601(data["createdAt"].to_s)
    rescue ArgumentError
      Time.current
    end

    def map_reference
      hidden = raw_fields.find { |f| f["type"] == "HIDDEN_FIELDS" && FormResponse::MAP_FIELDS.include?(f["label"].to_s.strip.downcase) }
      hidden && hidden["value"].to_s.strip.presence
    end

    def fields
      raw_fields.filter_map do |field|
        next if skipped?(field)
        value = text_for(field)
        Field.new(label: field["label"].to_s.squish.presence || "—", value:) if value.present?
      end
    end

    private
      def raw_fields = Array(data["fields"]).select { _1.is_a?(Hash) }

      def skipped?(field)
        type = field["type"]
        return true if type == "HIDDEN_FIELDS" && FormResponse::MAP_FIELDS.include?(field["label"].to_s.strip.downcase)
        # Tally repeats each checkbox as its own true/false field after the question.
        return true if type == "CHECKBOXES" && [ true, false ].include?(field["value"])
        false
      end

      def text_for(field)
        value = field["value"]
        case field["type"]
        when "MULTIPLE_CHOICE", "DROPDOWN", "MULTI_SELECT", "CHECKBOXES", "RANKING"
          labels = option_labels(field, value)
          field["type"] == "RANKING" ? labels.each_with_index.map { |l, i| "#{i + 1}. #{l}" }.join("\n") : labels.join(", ")
        when "FILE_UPLOAD", "SIGNATURE"
          Array(value).select { _1.is_a?(Hash) }.map { |f| [ f["name"], f["url"] ].compact.join(" : ") }.join("\n")
        when "MATRIX"
          matrix(field, value)
        else
          scalar(value)
        end
      end

      def option_labels(field, value)
        options = Array(field["options"]).select { _1.is_a?(Hash) }.to_h { [ _1["id"], _1["text"] ] }
        Array(value).map { |v| options.fetch(v, v).to_s }.reject(&:blank?)
      end

      def matrix(field, value)
        return scalar(value) unless value.is_a?(Hash)
        rows = Array(field["rows"]).select { _1.is_a?(Hash) }.to_h { [ _1["id"], _1["text"] ] }
        columns = Array(field["columns"]).select { _1.is_a?(Hash) }.to_h { [ _1["id"], _1["text"] ] }
        value.map { |row, cols| "#{rows.fetch(row, row)} : #{Array(cols).map { columns.fetch(_1, _1) }.join(", ")}" }.join("\n")
      end

      def scalar(value)
        case value
        when nil then nil
        when true then I18n.t("forms.document.yes")
        when false then I18n.t("forms.document.no")
        when Array then value.map { scalar(_1) }.compact.join(", ")
        when Hash then value.values.map { scalar(_1) }.compact.join(", ")
        when Float then value % 1 == 0 ? value.to_i.to_s : value.to_s
        else value.to_s.strip
        end
      end
  end
end

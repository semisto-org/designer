# A request payload as readable lines (label, value) in French: for the
# e-mails to Semisto and to the person, and the staff page.
class ServiceRequest::Summary
  def initialize(service_request)
    @request = service_request
  end

  def lines
    ServiceRequest::PAYLOADS.fetch(@request.kind).filter_map do |field|
      value = @request.payload[field.key]
      next unless TypedSchema.answered?(value)
      { label: translate(field.key, "label"), value: format(field, value) }
    end
  end

  private
    def translate(key, leaf, default: key.humanize)
      I18n.t("journey.requests.kinds.#{@request.kind}.fields.#{key}.#{leaf}", default:)
    end

    def format(field, value)
      case field.type
      when :enum then translate("#{field.key}", "options.#{value}", default: value)
      when :multi then value.map { |v| translate(field.key, "options.#{v}", default: v) }.join(", ")
      when :boolean then I18n.t("journey.affirmative")
      when :integer then [ value, translate(field.key, "unit", default: "") ].join(" ").strip
      when :list then value.map { |entry| list_line(entry) }.join("\n")
      else value.to_s
      end
    end

    def list_line(entry)
      line = entry["name"].to_s
      line += " × #{entry['quantity']}" if entry["quantity"]
      line += " (#{entry['note']})" if entry["note"].present?
      line
    end
end

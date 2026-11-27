# Amounts typed in a form: « 1 250,50 » or « 1250.5 » € → 125050 cents; nil
# when unreadable (the model or the controller refuses it). Zero is allowed:
# an invoice may leave an item out.
module ProjectInvoiceParams
  extend ActiveSupport::Concern

  private
    def cents(value)
      text = value.to_s.strip.delete("   €").tr(",", ".")
      return nil unless text.match?(/\A\d+(\.\d{1,2})?\z/)
      (BigDecimal(text) * 100).to_i
    end
end

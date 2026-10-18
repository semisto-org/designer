module Billing
  # A professional's VAT number, as printed on their invoices and given to
  # Stripe (tax id type eu_vat). A Belgian BCE number may be typed without its
  # country ("0790.631.657" or "790631657"): it becomes BE0790631657 and its
  # check digits are verified (the last two are 97 minus the first eight mod
  # 97). Other EU numbers keep their own country prefix.
  module VatNumber
    module_function

    # "0790.631.657" → "BE0790631657"; nil when it is not a valid number.
    def normalize(input)
      compact = input.to_s.upcase.gsub(/[^0-9A-Z]/, "")
      compact = "0#{compact}" if compact.match?(/\A\d{9}\z/)
      compact = "BE#{compact}" if compact.match?(/\A\d{10}\z/)
      vat = InvoiceAddress.eu_vat(compact) or return nil
      return nil if vat.start_with?("BE") && !belgian_check?(vat.delete_prefix("BE"))
      vat
    end

    def belgian_check?(digits)
      97 - digits[0, 8].to_i % 97 == digits[8, 2].to_i
    end

    # Puts the number on the Stripe customer unless it is already there. True
    # when it is on the customer; a number Stripe refuses is reported, not raised.
    def attach(gateway, customer_id, vat)
      return false if vat.blank?
      known = Array(gateway.list_tax_ids(customer_id)["data"]).any? do |tax_id|
        tax_id["type"] == "eu_vat" && tax_id["value"].to_s.upcase.gsub(/[^0-9A-Z]/, "") == vat
      end
      gateway.create_tax_id(customer_id, type: "eu_vat", value: vat) unless known
      true
    rescue Providers::StripeGateway::Error => e
      Rails.error.report(e, handled: true, severity: :warning)
      false
    end
  end
end

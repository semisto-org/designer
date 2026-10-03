module Billing
  # Readers for Stripe payloads (string-keyed hashes). The shape of invoices
  # and subscriptions changed between API versions (subscription id and
  # period moved under "parent" and the items, tax became "total_taxes"):
  # webhook endpoints may use either, so each reader accepts both.
  module Payload
    module_function

    def id_of(value) = value.is_a?(Hash) ? value["id"] : value.presence

    def time(unix) = unix.present? ? Time.zone.at(unix.to_i) : nil

    def invoice_subscription_id(invoice)
      id_of(invoice["subscription"]) || id_of(invoice.dig("parent", "subscription_details", "subscription"))
    end

    def invoice_tax_cents(invoice)
      if invoice.key?("total_taxes")
        Array(invoice["total_taxes"]).sum { |tax| tax["amount"].to_i }
      else
        invoice["tax"].to_i
      end
    end

    def invoice_discount_cents(invoice)
      Array(invoice["total_discount_amounts"]).sum { |discount| discount["amount"].to_i }
    end

    def invoice_user_id(invoice)
      invoice.dig("parent", "subscription_details", "metadata", "user_id").presence ||
        invoice.dig("subscription_details", "metadata", "user_id").presence ||
        invoice.dig("metadata", "user_id").presence
    end

    def subscription_items(subscription)
      Array(subscription.dig("items", "data"))
    end

    def subscription_price_id(subscription)
      id_of(subscription_items(subscription).first&.dig("price"))
    end

    # [start, end] of the current period (on the items in recent API versions).
    def subscription_period(subscription)
      items = subscription_items(subscription)
      starts = subscription["current_period_start"] || items.filter_map { |i| i["current_period_start"] }.min
      ends = subscription["current_period_end"] || items.filter_map { |i| i["current_period_end"] }.max
      [ time(starts), time(ends) ]
    end
  end
end

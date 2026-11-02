module Mcp
  module Tools
    # The working offer of a map, for the team that prices it (never the
    # client): its budget phase by phase and the client document as it
    # stands, block by block, with the letter « Votre projet » and the one
    # an AI proposed, if any. What an AI reads before writing that letter
    # (propose_offer_letter), with the project sheet, the map and the
    # documents of the visit.
    class GetOffer < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints(read_only: true)

      def perform(map_id:)
        map = find_map!(map_id)
        offer = OfferAccess.offer!(self, map)
        document = Offer::ClientDocument.for(offer, map:, issuer: map.organization&.name || map.owner.display_name)
        result = offer.result
        {
          map_id: map.id, url: "#{map_url(map)}/offer", preview_url: "#{map_url(map)}/offer/preview",
          pricing_name: offer.pricing_name, client: offer.measures.to_h["lead_name"],
          budget: {
            total_tvac: result.dig("totals", "total_tvac"), total_max_tvac: result.dig("totals", "total_max_tvac"),
            phases: result["phases"].map { { key: _1["key"], enabled: _1["enabled"] != false, price_tvac: _1["price_tvac"], hours_min: _1["hours_min"], hours_max: _1["hours_max"] } },
            plants: result.dig("totals", "planting_included") == false ? nil : result["plants"].slice("count_base", "plants_base_tvac", "supplies_base_tvac"),
            co_management: result.dig("co_management", "enabled") ? result["co_management"].slice("amount_tvac", "years") : nil
          }.compact,
          scope: Array(offer.measures.to_h["scope"]).reject { _1["missing"] }.map { _1.slice("planting_type", "label", "measure_kind", "measure", "plants_total", "option") },
          letter: document.letter,
          letter_draft: document.letter_draft&.slice("body", "proposed_at"),
          sections: document.sections.map { |s| s.slice(:key, :title, :markdown).merge(phases: s[:phases]&.map { _1.except(:html) }).compact },
          versions: offer.versions.map { { number: _1.number, label: _1.label, status: _1.status } },
          next_step: t("notes.offer_letter")
        }.compact
      end

      private
        def summarize_result(data) = { sections: data[:sections].size, letter: data[:letter].present? }
    end
  end
end

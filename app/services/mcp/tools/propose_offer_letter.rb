module Mcp
  module Tools
    # Proposes the letter « Votre projet » of a map's offer: written for its
    # client from what the team saw and heard (the project sheet, the map,
    # the documents of the visit). A draft: the team takes it or refuses it
    # in the offer's « Document client », then edits it as it likes. A new
    # proposal replaces the one not reviewed yet; the letter in place only
    # changes when the team takes the draft.
    class ProposeOfferLetter < Base
      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          body: { type: "string", minLength: 200, maxLength: Offer::Document::MAX_LETTER, description: :letter_body },
          rationale: { type: "string", minLength: 10, maxLength: 2000, description: :letter_rationale }
        },
        required: %w[map_id body rationale]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(map_id:, body:, rationale:)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        offer = OfferAccess.offer!(self, map)
        inputs = offer.inputs.deep_dup
        replaces = inputs.dig("document", "letter").present?
        inputs["document"] = inputs["document"].to_h.merge(
          "letter_draft" => { "body" => body, "rationale" => rationale, "client_name" => principal.client_name, "proposed_at" => Time.current.iso8601 }
        )
        offer.update!(inputs:, updated_by: user)
        {
          map_id: map.id, replaces_letter: replaces || nil,
          review_url: "#{map_url(map)}/offer#document",
          next_step: t(replaces ? "notes.review_offer_letter_replacing" : "notes.review_offer_letter")
        }.compact
      end

      private
        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], body: arguments[:body].to_s.size, rationale: arguments[:rationale].to_s.first(200) }
        end

        def summarize_result(data) = { replaces_letter: data[:replaces_letter] || false }
    end
  end
end

module Mcp
  module Tools
    # « Demandes de multiplication »: the requests that reached the places
    # the user owns and the ones they sent, as the /propagation page shows
    # them. E-mail addresses appear only once an owner accepted. Answering
    # and sending stay with the person, on the page.
    class ListPropagationRequests < Base
      arguments(
        properties: {
          box: { type: "string", enum: %w[received sent all], default: "all", description: :propagation_box },
          status: { type: "string", enum: %w[pending accepted declined withdrawn all], default: "all", description: :propagation_status }
        }
      )
      hints

      LIMIT = 200

      def perform(box: "all", status: "all")
        received = %w[received all].include?(box) ? filter(PropagationRequest.received_by(user), status).includes(:map, :species, :variety, :requester, :answered_by) : []
        sent = %w[sent all].include?(box) ? filter(user.propagation_requests, status).includes(:species, :variety, :answered_by, map: :region) : []
        {
          places: user.map_memberships.where(place_owner: true).includes(:map).map { |m| place_json(m.map) },
          received: received.map { received_json(_1) },
          sent: sent.map { sent_json(_1) },
          materials: PropagationRequest::MATERIALS.index_with { I18n.t("propagation.materials.#{_1}") },
          url: "#{origin}/propagation"
        }
      end

      private
        def filter(scope, status)
          scope = scope.where(status:) unless status == "all"
          scope.newest_first.limit(LIMIT)
        end

        def place_json(map)
          { map_id: map.id, name: map.name, shares_planted_palette: map.shares_planted_palette, accepts_propagation_requests: map.accepts_propagation_requests }
        end

        def received_json(request)
          base_json(request).merge(
            map: { id: request.map_id, name: request.map.name },
            requester: { name: request.requester.display_name, email: (request.requester.email_address if request.accepted?) }.compact,
            can_answer: request.answerable_by?(user)
          )
        end

        # The place stays anonymous to the requester: its region only.
        def sent_json(request)
          owner = request.answered_by if request.accepted?
          base_json(request).merge(region: request.map.region&.name, owner: owner && { name: owner.display_name, email: owner.email_address })
        end

        def base_json(request)
          {
            id: request.id, species_id: request.species_id, variety_id: request.variety_id, plant: request.plant_name,
            material: request.material, message: request.message, status: request.status,
            answer: request.answer, answered_by: request.answered_by&.display_name,
            created_at: request.created_at.iso8601, answered_at: request.answered_at&.iso8601
          }.compact
        end

        def summarize_result(data) = { received: data[:received].size, sent: data[:sent].size }
    end
  end
end

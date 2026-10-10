module Mcp
  module Tools
    # What the AI sees on a photo of wild plants: each plant as a draft
    # observation at the photo's place, which the human accepts or refuses in
    # the Sol panel (Plantes tab), and a short reading of the soil kept with the
    # photo. A new proposal for a photo replaces its drafts not yet reviewed.
    class ProposeBioindicators < Base
      MAX_PLANTS = 30

      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          photo_id: { type: "integer", minimum: 1, description: :photo_id },
          summary: { type: "string", minLength: 10, maxLength: 6000, description: :soil_summary },
          plants: {
            type: "array", minItems: 1, maxItems: MAX_PLANTS, description: :wild_plants,
            items: {
              type: "object", additionalProperties: false, required: %w[name abundance confidence rationale],
              properties: {
                catalog_key: { type: "string", maxLength: 80, description: :catalog_key },
                name: { type: "string", minLength: 2, maxLength: 120, description: :wild_plant_name },
                latin_name: { type: "string", maxLength: 160, description: :latin_name },
                abundance: { type: "string", enum: BioindicatorObservation::ABUNDANCES, description: :abundance },
                confidence: { type: "string", enum: BioindicatorObservation::CONFIDENCES, description: :confidence },
                rationale: { type: "string", minLength: 10, maxLength: 2000, description: :wild_plant_rationale }
              }
            }
          }
        },
        required: %w[map_id photo_id summary plants]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, photo_id:, summary:, plants:)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        photo = map.photos.find_by(id: photo_id) or raise ToolError, t("errors.photo_not_found", id: photo_id)

        created, rejected = [], []
        BioindicatorObservation.transaction do
          photo.bioindicator_observations.drafts.destroy_all
          plants.each_with_index do |plant, index|
            observation = build(map, photo, plant)
            if observation.save
              created << { index:, id: observation.id, name: observation.species_name, catalog_key: observation.catalog_key }
            else
              rejected << { index:, error: observation.errors.full_messages.to_sentence }
            end
          end
          raise ToolError, t("errors.nothing_created", details: rejected.first(10).map { |r| "##{r[:index]} : #{r[:error]}" }.join(" ; ")) if created.empty?
          photo.update!(bioindicator_status: "analyzed", bioindicator_summary: summary, bioindicator_analyzed_at: Time.current)
        end
        { created:, rejected:, review_url: map_url(map), next_step: t("notes.review_bioindicators") }
      end

      private
        # The key of the curated list, else the list's entry for the Latin name.
        def build(map, photo, plant)
          key = plant[:catalog_key].presence
          key = nil if key && SoilAnalysis::BioindicatorCatalog.find(key).nil?
          key ||= SoilAnalysis::BioindicatorCatalog.find_by_latin(plant[:latin_name])&.fetch("key")
          map.bioindicator_observations.new(
            photo:, location: photo.location, catalog_key: key,
            species_name: plant[:name], latin_name: plant[:latin_name].presence,
            abundance: plant[:abundance], confidence: plant[:confidence], rationale: plant[:rationale],
            observed_on: photo.taken_at&.to_date || Date.current,
            status: "draft", source: "ai"
          )
        end

        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], photo_id: arguments[:photo_id], plants: Array(arguments[:plants]).size }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end

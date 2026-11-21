module Mcp
  module Tools
    # Fills the look of catalogue species, as the 3D view paints them
    # (PlantLook): foliage tone, leaf texture, crown density and the colours
    # of flowers, fruits, bark and autumn leaves. For catalogue reviewers
    # only (Semisto), at their request: each value cites the page it was read
    # on and lands « to verify » (source « ai », the page as upstream source),
    # so the sheet says it is still to be checked by a person.
    #
    # It only fills what is empty: a value the species already has (from an
    # import, a person or its genus' guess made explicit) is kept and comes
    # back under `kept`, for the reviewer to decide. PFAF only cross-checks
    # and is never cited as a source.
    class RecordPlantLooks < Base
      MAX_PLANTS = 50

      requirement :write
      arguments(
        properties: {
          plants: {
            type: "array", minItems: 1, maxItems: MAX_PLANTS, description: :look_plants,
            items: {
              type: "object", additionalProperties: false, required: %w[plant_id values source url],
              properties: {
                plant_id: { type: "integer", minimum: 1, description: :plant_id },
                values: {
                  type: "object", additionalProperties: false, minProperties: 1, description: :look_values,
                  properties: PlantLook::TRAITS.to_h { |trait| [ trait, { type: "string", enum: PlantVocabulary.keys(trait) } ] }
                },
                source: { type: "string", minLength: 2, maxLength: 40, description: :look_source },
                url: { type: "string", format: "uri", maxLength: 500, description: :look_url }
              }
            }
          }
        },
        required: %w[plants]
      )
      hints(read_only: false, destructive: false, idempotent: true)

      def perform(plants:)
        require_drafts_scope!
        raise ToolError, t("errors.catalogue_reviewers_only") unless user.can_review_catalogue?
        results = plants.map { |entry| record(entry.to_h.transform_keys(&:to_s)) }
        { plants: results, next_step: t("notes.plant_looks_written") }
      end

      private
        def record(entry)
          species = PlantSpecies.find_by(id: entry["plant_id"])
          return { plant_id: entry["plant_id"], error: t("errors.plant_not_found", id: entry["plant_id"]) } unless species
          upstream = PlantVocabulary.normalize(entry["source"]).to_s.tr(" ", "_")
          url = entry["url"].to_s
          if !PlantSource.valid?(upstream) || PlantSource.cross_check_only?(upstream)
            return { plant_id: species.id, error: t("errors.look_source_invalid", source: entry["source"]) }
          end
          return { plant_id: species.id, error: t("errors.look_url_invalid") } unless url.match?(%r{\Ahttps?://\S+\z})

          values = entry["values"].to_h.transform_keys(&:to_s).slice(*PlantLook::TRAITS.map(&:to_s))
          kept, fresh = values.partition { |field, _| kept?(species, field) }.map(&:to_h)
          written = fresh.any? ? writer(upstream, url).write(species, fresh) : []
          {
            plant_id: species.id, latin_name: species.latin_name, written:,
            kept: kept.to_h { |field, proposed| [ field, { current: species.public_send(field), proposed: } ] },
            url: "#{origin}/plants/#{species.to_param}"
          }
        end

        # A value already there stays, unless it is this AI's own earlier reading.
        def kept?(species, field)
          species.field_value_present?(field) && species.provenance_for(field)&.source != "ai"
        end

        def writer(upstream, url)
          Catalog::SpeciesWriter.new(source: "ai", status: "to_verify", upstream_source: upstream, url:)
        end

        def summarize_arguments(arguments) = { plants: Array(arguments[:plants]).size }
        def summarize_result(data) = { written: data[:plants].sum { Array(_1[:written]).size } }
    end
  end
end

module Mcp
  module Tools
    # Drafts text slides for the map's « Présenter » sequence (« Défis et
    # atouts », « Raison d'être »…), from the project sheet, the reading of the
    # place and what the person said. Each draft fills a slide of the
    # sequence or comes as a new one; an editor accepts or refuses it in the
    # panel. A map without a presentation gets Semisto's pre-design one.
    class ProposePresentationSlides < Base
      requirement :propose
      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          slides: {
            type: "array", minItems: 1, maxItems: 12, description: :slides,
            items: {
              type: "object", additionalProperties: false, required: %w[body rationale],
              properties: {
                step_id: { type: "string", maxLength: 40, description: :slide_step_id },
                after_step_id: { type: "string", maxLength: 40, description: :after_step_id },
                title: { type: "string", maxLength: 120, description: :slide_title },
                body: { type: "string", minLength: 1, maxLength: MapPresentation::MAX_BODY, description: :slide_body },
                rationale: { type: "string", minLength: 10, maxLength: 2000, description: :slide_rationale }
              }
            }
          }
        },
        required: %w[map_id slides]
      )
      hints(read_only: false, destructive: false, idempotent: false)

      def perform(map_id:, slides:)
        map = find_map!(map_id)
        require_drafts_scope!
        require_editor!
        require_ai_drafts_plan!(map)
        presentation = map.presentations.first || begin
          template = PresentationTemplate.find("pre_design")
          map.presentations.create!(name: template.name, template_key: template.key, steps: template.steps(map:))
        end
        drafts = slides.each_with_index.map do |slide, index|
          slide = slide.to_h.symbolize_keys
          MapPresentation::Draft.new(index:, step_id: slide[:step_id], after: slide[:after_step_id], title: slide[:title]&.squish.presence,
                                     body: slide[:body].to_s.strip, rationale: slide[:rationale].to_s.strip)
        end
        placed, refused = presentation.propose_slides!(drafts, by: principal.client_name)
        raise ToolError, t("errors.nothing_created", details: refused.map { "##{_1[:index]} : #{_1[:error]}" }.join(" ; ")) if placed.empty?
        {
          created: placed,
          rejected: refused,
          presentation_id: presentation.id,
          review_url: "#{map_url(map)}?panel=present",
          next_step: t("notes.review_slides", count: placed.size)
        }
      end

      private
        def summarize_arguments(arguments)
          { map_id: arguments[:map_id], slides: Array(arguments[:slides]).size }
        end

        def summarize_result(data) = { created: data[:created].size, rejected: data[:rejected].size }
    end
  end
end

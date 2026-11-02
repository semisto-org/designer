class Offer
  # The client's document of an offer, as blocks the account chooses and
  # writes: a cover, the letter « Votre projet », the approach in three
  # steps, the scope, one page per phase, co-management, the software,
  # the deliverables, the budget and a conclusion with the team's contacts.
  #
  # Each account's template (Pricing data["document"]) says which blocks it
  # keeps and their texts; each offer (Inputs["document"]) can change them
  # again for that client and carries its own letter. A text left blank
  # falls back, layer by layer: offer → template → Semisto's text, which
  # lives in config/locales/offer_documents.fr.yml (interface copy, French).
  #
  # Texts are Markdown (CommonMark, raw HTML dropped) with three
  # placeholders: {client}, {lieu} and {equipe}.
  module Document
    # In the order the client reads them.
    BLOCKS = %w[cover letter approach scope phases co_management software deliverables budget conclusion].freeze
    # Blocks whose text is written phase by phase. The approach tells the three
    # steps only: co-management follows them, it is not a step of its own.
    STEPS = [ *Pricing::PHASES, "co_management" ].freeze
    PHASED = { "approach" => Pricing::PHASES, "phases" => Pricing::PHASES, "deliverables" => STEPS }.freeze
    MAX_TITLE = 120
    MAX_BODY = 8_000
    MAX_LETTER = 12_000
    PLACEHOLDERS = %w[client lieu equipe].freeze

    module_function

    # A template's or an offer's own changes: { "blocks" => { key => { enabled, title, body, phases } } }.
    # Only what is set is kept, so a blank falls back to the layer below.
    def normalize(raw, letter: false)
      raw = Inputs.hash(raw)
      blocks = Inputs.hash(raw["blocks"])
      out = {
        "blocks" => BLOCKS.each_with_object({}) do |key, memo|
          block = block(Inputs.hash(blocks[key]), key)
          memo[key] = block if block.any?
        end
      }
      return out unless letter
      out.merge("letter" => text(raw["letter"], MAX_LETTER), "letter_draft" => letter_draft(raw["letter_draft"])).compact
    end

    def block(raw, key)
      phases = PHASED[key]&.each_with_object({}) do |phase, memo|
        value = text(Inputs.hash(raw["phases"])[phase], MAX_BODY)
        memo[phase] = value if value
      end
      {
        "enabled" => Inputs.boolean(raw["enabled"]),
        "title" => Inputs.string(raw["title"], MAX_TITLE),
        "body" => text(raw["body"], MAX_BODY),
        "phases" => phases.presence
      }.compact
    end

    # A letter an AI proposed (MCP propose_offer_letter), waiting for the team.
    def letter_draft(raw)
      raw = Inputs.hash(raw)
      body = text(raw["body"], MAX_LETTER)
      return nil unless body
      {
        "body" => body, "rationale" => text(raw["rationale"], 2_000), "client_name" => Inputs.string(raw["client_name"], 100),
        "proposed_at" => Inputs.string(raw["proposed_at"], 40)
      }.compact
    end

    def text(value, limit)
      return nil unless value.is_a?(String)
      value.gsub("\r\n", "\n").strip.first(limit).presence
    end

    # Semisto's blocks, from the locale: every block on, with its text.
    def defaults
      BLOCKS.to_h do |key|
        phases = PHASED[key]&.index_with { I18n.t("offer_documents.blocks.#{key}.phases.#{_1}", default: "").presence }
        [ key, {
          "enabled" => true,
          "title" => I18n.t("offer_documents.blocks.#{key}.title"),
          "body" => I18n.t("offer_documents.blocks.#{key}.body", default: "").presence,
          "phases" => phases
        }.compact ]
      end
    end

    # The blocks as they apply: Semisto's, then each layer's changes on top.
    def resolve(*layers)
      BLOCKS.to_h do |key|
        block = defaults[key].deep_dup
        layers.compact.each do |layer|
          own = Inputs.hash(Inputs.hash(layer["blocks"])[key])
          block["enabled"] = own["enabled"] unless own["enabled"].nil?
          %w[title body].each { |field| block[field] = own[field] if own[field].present? }
          own["phases"]&.each { |phase, value| block["phases"][phase] = value if value.present? } if block["phases"]
        end
        [ key, block ]
      end
    end

    def fill(text, values)
      return text if text.nil?
      text.gsub(/\{(#{PLACEHOLDERS.join("|")})\}/) { values[Regexp.last_match(1)].to_s }
    end
  end
end

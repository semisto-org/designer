class Offer
  # The client document of an offer or of a saved version, as its reader
  # gets it: the blocks that apply (Offer::Document, offer over template
  # over Semisto), in order, with their texts filled in ({client}, {lieu},
  # {equipe}) and rendered (Markdown → safe HTML). A phase the team left
  # out of the offer, and co-management when it is not offered, leave the
  # document too. The budget and the scope stay numbers: whoever renders
  # the document (the page, the Word file) reads them from the result.
  class ClientDocument
    MARKDOWN_OPTIONS = {
      extension: { table: true, strikethrough: true, autolink: true, tasklist: false },
      parse: { smart: true },
      render: { unsafe: false, hardbreaks: false }
    }.freeze

    # source: an Offer or an OfferVersion.
    def self.for(source, map:, issuer:)
      new(inputs: source.inputs, result: source.result, measures: source.is_a?(Offer) ? source.measures.to_h : source.measures,
          pricing: source.is_a?(Offer) ? source.pricing : Pricing.new(source.pricing.presence || Pricing::SEMISTO),
          map:, issuer:)
    end

    attr_reader :inputs, :result, :measures, :map, :issuer, :terms

    def initialize(inputs:, result:, measures:, pricing:, map:, issuer:)
      @inputs = inputs.to_h
      @result = result.to_h
      @measures = measures.to_h
      @template = pricing.document
      @terms = pricing.terms
      @map = map
      @issuer = issuer
    end

    def own = Inputs.hash(inputs["document"])
    def letter = own["letter"]
    def letter_draft = own["letter_draft"]
    def blocks = @blocks ||= Document.resolve(@template, own)

    def values
      @values ||= {
        "client" => measures["lead_name"].presence || I18n.t("offers.document.client_fallback"),
        "lieu" => map.name, "equipe" => issuer
      }
    end

    def enabled_phases = Array(result["phases"]).select { _1["enabled"] != false }.map { _1["key"] }
    def co_management? = result.dig("co_management", "enabled") == true

    # The steps the client takes: the phases in the offer, then co-management if offered.
    def steps = [ *enabled_phases, *("co_management" if co_management?) ]

    def sections
      @sections ||= Document::BLOCKS.filter_map do |key|
        block = blocks[key]
        next unless block["enabled"]
        next if key == "co_management" && !co_management?
        next if key == "letter" && letter.blank?
        next if key == "phases" && enabled_phases.empty?
        section(key, block)
      end
    end

    def to_h
      { sections:, letter:, letterDraft: letter_draft, values: }
    end

    def render(text) = text.present? ? Commonmarker.to_html(Document.fill(text, values), options: MARKDOWN_OPTIONS, plugins: { syntax_highlighter: nil }) : nil
    def fill(text) = Document.fill(text, values)

    private
      def section(key, block)
        body = key == "letter" ? letter : block["body"]
        out = {
          key:, title: fill(block["title"]), markdown: fill(body), html: render(body),
          # What closes the letter (the template's words and signature).
          closing: (fill(block["body"]) if key == "letter"),
          closingHtml: (render(block["body"]) if key == "letter")
        }
        if (phased = Document::PHASED[key])
          keys = key == "phases" ? enabled_phases : steps
          out[:phases] = (phased & keys).map do |phase|
            text = block.dig("phases", phase)
            { key: phase, markdown: fill(text), html: render(text) }
          end
        end
        out.compact
      end
  end
end

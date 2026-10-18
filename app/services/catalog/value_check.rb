module Catalog
  # Checks the values of a proposed species against open pages, for the
  # catalogue reviewer: for each value, does PFAF or Wikipédia confirm it,
  # contradict it, or not say? The logic comes from the « Plantes » section
  # of Semisto's internal Terranova app (its documenter), ported here.
  #
  # Jev judges, it never produces a value:
  # - closed vocabularies (habit, foliage, life cycle, fertility): a choice
  #   among the keys, always with « the page does not say »;
  # - lists (exposure, soil moisture, edible parts, services): a yes/no per
  #   value the species has;
  # - numbers (height, spread, USDA zone): the code finds the figures in the
  #   text, Jev only points at the one that answers (it compares numbers
  #   badly);
  # - months (flowering, harvest): Jev points at the sentence, the code reads
  #   the months in it.
  #
  # Each page is judged on its own, then the pages are compared: a value one
  # page confirms and none contradicts is « confirmed », a value a page
  # states otherwise is « contradicted » (with that page's value, which the
  # reviewer may take). Below MIN_CONFIDENCE, Jev's answer counts as silence.
  # Nothing is written to the species: the verdicts land in PlantValueCheck.
  class ValueCheck
    MIN_CONFIDENCE = 0.8
    LIST_MIN = 0.7
    NOT_STATED = "not_stated".freeze
    MAX_LINES = 240

    PLANT = "the plant named in `plant`".freeze

    CHOICES = {
      "plant_type" => [ "Which growth form best describes #{PLANT} at maturity, according to `lines`?", {
        "tree" => "A woody plant with a single trunk, typically taller than 5 m.",
        "shrub" => "A woody plant with several stems, roughly 1.5 to 5 m tall.",
        "small-shrub" => "A woody plant with several stems, under about 1.5 m tall (includes subshrubs).",
        "climber" => "A plant that climbs, scrambles or twines on supports (vine, liana).",
        "herbaceous" => "A non-woody plant (herb, perennial, annual, bulb, fern, grass).",
        "ground-cover" => "A low plant whose main habit is to spread horizontally and carpet the ground.",
        "aquatic" => "A plant that grows in water or at the water's edge." } ],
      "foliage_type" => [ "What kind of foliage does #{PLANT} have, according to `lines`?", {
        "deciduous" => "Loses all its leaves in winter.",
        "evergreen" => "Keeps green leaves all year round.",
        "semi-evergreen" => "Keeps part of its leaves in mild winters.",
        "marcescent" => "Dead leaves stay attached through winter." } ],
      "life_cycle" => [ "What is the life cycle of #{PLANT}, according to `lines`?", {
        "annual" => "Completes its life cycle in one year.",
        "biennial" => "Lives two years, flowering in the second.",
        "perennial" => "Lives more than two years (includes all trees and shrubs)." } ],
      "fertility" => [ "How does #{PLANT} set fruit, according to `lines`?", {
        "self-fertile" => "A single plant sets fruit with its own pollen (hermaphrodite and self-fertile).",
        "partially-self-fertile" => "Sets some fruit alone, but more with a pollination partner.",
        "self-sterile" => "Hermaphrodite flowers, but needs pollen from another plant or cultivar.",
        "dioecious" => "Separate male and female plants." } ]
    }.freeze

    # Habits a page may name either way: a 1 m shrub is both.
    SAME_HABIT = [ %w[shrub small-shrub] ].freeze

    LISTS = {
      "exposures" => {
        "sun" => "grows well in full sun (no shade)",
        "partial-shade" => "grows well in partial shade, semi-shade or light woodland",
        "shade" => "grows well in full or deep shade" },
      "soil_moisture" => {
        "dry" => "grows in dry or very well-drained soils, or tolerates drought",
        "moist" => "grows in moist but well-drained soils",
        "wet" => "grows in wet soils, damp ground or stream banks",
        "waterlogged" => "grows in waterlogged soils, bogs or standing water" },
      "edible_parts" => {
        "fruit" => "has edible fruit", "flower" => "has edible flowers", "leaf" => "has edible leaves",
        "seed" => "has edible seeds or nuts", "root" => "has edible roots, tubers or bulbs",
        "bark" => "has edible inner bark", "sap" => "has edible sap (sugar, syrup, drink)",
        "shoot" => "has edible young shoots or stems" },
      "eco_services" => {
        "mellifere" => "is a good nectar or pollen source for bees",
        "nitrogen" => "fixes atmospheric nitrogen",
        "windbreak" => "is used as a windbreak or hedge",
        "ground-cover" => "is used as a ground cover that suppresses weeds",
        "beneficial-insects" => "attracts beneficial insects such as hoverflies or ladybirds",
        "birds" => "provides food or shelter for birds and wildlife",
        "organic-matter" => "produces abundant biomass used as mulch or compost",
        "erosion-control" => "is used to stabilise soil or control erosion",
        "minerals" => "is described as a dynamic accumulator of minerals",
        "light-shade" => "is used to give light shade to other plants",
        "pioneer" => "is a pioneer species that colonises bare or disturbed ground",
        "cross-pollination" => "is used as a pollinator for other cultivars",
        "ornamental" => "is grown as an ornamental" }
    }.freeze

    LINE_TOPICS = {
      "plant_type" => "the growth form or habit of the plant (tree, shrub, climber, herb…)",
      "foliage_type" => "whether the plant is deciduous or evergreen",
      "life_cycle" => "whether the plant is annual, biennial or perennial",
      "fertility" => "how the plant is pollinated or sets fruit (sexes, self-fertility)",
      "exposures" => "how much sun or shade the plant tolerates",
      "soil_moisture" => "the soil moisture the plant prefers",
      "edible_parts" => "which parts of the plant are edible",
      "eco_services" => "what the plant does for other organisms (bees, nitrogen, wildlife, hedges…)",
      "flowering_months" => "when the plant flowers",
      "harvest_months" => "when the edible parts (fruit, seeds, leaves…) ripen or are harvested"
    }.freeze

    FIELDS = [ *CHOICES.keys, *LISTS.keys, "height_max_m", "spread_max_m", "hardiness_zone", "flowering_months", "harvest_months" ].freeze

    NUMBER = /(\d+(?:[.,]\d+)?)(?:\s*(?:–|-|to|à)\s*(\d+(?:[.,]\d+)?))?\s*(m|metres|meters|mètres|cm|centimetres|centimeters|centimètres|ft|feet|foot)\b/i
    ZONE = /(?:USDA[^.\n]{0,30}?zones?|hardiness zones?|hardy (?:to|in) zones?|zones?)\s*:?\s*(\d{1,2})[ab]?(?:\s*(?:-|–|to|through|à)\s*(\d{1,2})[ab]?)?/i
    MONTHS = [ /\bjan(uary|vier)?\b/i, /\bfeb(ruary)?\b|\bf[ée]vr(ier)?\b/i, /\bmar(ch|s)\b/i, /\bapr(il)?\b|\bavril\b/i,
               /\bmay\b|\bmai\b/i, /\bjune?\b|\bjuin\b/i, /\bjuly?\b|\bjuillet\b/i, /\baug(ust)?\b|\bao[ûu]t\b/i,
               /\bsept?(ember)?\b|\bseptembre\b/i, /\boct(ober|obre)?\b/i, /\bnov(ember|embre)?\b/i, /\bdec(ember)?\b|\bd[ée]cembre\b/i ].freeze
    RIPEN = /(ripen|harvest|picked|gathered|récolt|matur|cueill)\w*/i
    FLOWER = /(flower|bloom|blossom|fleur|floraison)\w*/i

    Finding = Data.define(:value, :confidence, :excerpt)

    def initialize(species, jev: Providers::Jev.build, pages: Providers::PlantPages.build)
      @species = species
      @jev = jev
      @pages = pages
    end

    # Fields with a value this check can judge.
    def self.checkable_fields(species) = FIELDS.select { |f| species.field_value_present?(f) }

    def run
      raise Providers::Jev::Unavailable, "not configured" unless @jev.available?

      fields = self.class.checkable_fields(@species)
      judged = fields.empty? ? [] : @pages.for(@species.latin_name).map { |page| [ page, judge(page, fields) ] }
      PlantValueCheck.transaction do
        @species.value_checks.delete_all
        fields.each { |field| verdict(field, judged)&.then { |attrs| @species.value_checks.create!(field:, **attrs) } }
        @species.update!(values_checked_at: Time.current, values_check_error: nil)
      end
      @species.value_checks.reset
    end

    private
      # --- Jev, page by page ---------------------------------------------------

      def judge(page, fields)
        lines = split_lines(page.text)
        heights = number_candidates(page.text)
        zones = zone_candidates(page.text)
        state = { plant: @species.latin_name, source: page.key,
                  lines: lines.each_with_index.map { |l, i| "#{line_id(i)}| #{l}" }.join("\n") }
        answers = @jev.ask(state:, questions: questions(fields, lines.size, heights, zones))
        read(answers, fields, lines, heights, zones)
      end

      def questions(fields, line_count, heights, zones)
        q = {}
        (CHOICES.keys & fields).each do |field|
          instructions, options = CHOICES.fetch(field)
          q[field] = { type: "choice", instructions:,
                       criteria: options.merge(NOT_STATED => "`lines` do not give enough information to decide.") }
        end
        (LISTS.keys & fields).each do |field|
          Array(@species.public_send(field)).each do |key|
            meaning = LISTS.dig(field, key) or next
            q["#{field}.#{key}"] = { type: "noul", instructions: "According to `lines`, #{PLANT} #{meaning}.",
                                     criteria: { true: "`lines` state it or clearly imply it.",
                                                 false: "`lines` say otherwise, or do not say it." } }
          end
        end
        line_options = (0...line_count).to_h { |i| [ line_id(i), nil ] }.merge("none" => "No line addresses this.")
        LINE_TOPICS.slice(*fields).each do |field, topic|
          q["#{field}.line"] = { type: "choice", instructions: "Which line of `lines` best states #{topic} for #{PLANT}?",
                                 criteria: line_options }
        end
        if heights.any?
          options = heights.to_h { |c| [ c[:id], c[:snippet] ] }.merge("none" => "None of the candidates gives this measure.")
          if fields.include?("height_max_m")
            q["height_max_m"] = { type: "choice", criteria: options,
                                  instructions: "Which candidate gives the maximum HEIGHT that the whole plant (not a leaf, flower or fruit) reaches at maturity? In the phrasing 'growing to X by Y', X is the height." }
          end
          if fields.include?("spread_max_m")
            q["spread_max_m"] = { type: "choice", criteria: options,
                                  instructions: "Which candidate gives the maximum WIDTH (spread) of the whole plant at maturity? In the phrasing 'growing to X by Y', Y is the width." }
          end
        end
        if zones.any? && fields.include?("hardiness_zone")
          q["hardiness_zone"] = { type: "choice", instructions: "Which candidate gives the USDA hardiness zone range of #{PLANT}? Ignore UK or European zone systems.",
                                  criteria: zones.to_h { |c| [ c[:id], c[:snippet] ] }.merge("none" => "None of the candidates is a USDA hardiness zone for this plant.") }
        end
        q
      end

      def read(answers, fields, lines, heights, zones)
        found = {}
        line = lambda do |field|
          id = answers.dig("#{field}.line", "choice").to_s
          id.start_with?("S") ? lines[id.delete_prefix("S").to_i] : nil
        end

        (CHOICES.keys & fields).each do |field|
          answer = answers[field] or next
          next if answer["choice"].blank? || answer["choice"] == NOT_STATED

          found[field] = Finding.new(value: answer["choice"], confidence: answer["confidence"].to_f, excerpt: line.(field))
        end

        (LISTS.keys & fields).each do |field|
          confirmed = Array(@species.public_send(field)).select { |key| answers.dig("#{field}.#{key}", "noul").to_f >= LIST_MIN }
          next if confirmed.empty?

          found[field] = Finding.new(value: confirmed, confidence: confirmed.map { answers.dig("#{field}.#{_1}", "noul").to_f }.min,
                                     excerpt: line.(field))
        end

        %w[height_max_m spread_max_m].each do |field|
          answer = answers[field] or next
          candidate = heights.find { |c| c[:id] == answer["choice"] } or next
          found[field] = Finding.new(value: candidate[:metres], confidence: answer["confidence"].to_f, excerpt: candidate[:context])
        end

        if (answer = answers["hardiness_zone"]) && (candidate = zones.find { |c| c[:id] == answer["choice"] })
          found["hardiness_zone"] = Finding.new(value: candidate[:zone], confidence: answer["confidence"].to_f, excerpt: candidate[:context])
        end

        { "flowering_months" => :flowering, "harvest_months" => :harvest }.each do |field, kind|
          sentence = line.(field) or next
          months = months_in(sentence, kind)
          next if months.empty?

          found[field] = Finding.new(value: months, confidence: answers.dig("#{field}.line", "confidence").to_f, excerpt: sentence)
        end
        found
      end

      # --- The pages compared --------------------------------------------------

      def verdict(field, judged)
        ours = @species.public_send(field)
        findings = judged.filter_map { |page, found| (f = found[field]) && f.confidence >= confidence_min(field) ? [ page, f ] : nil }
        return { verdict: "unknown" } if findings.empty?

        if LISTS.key?(field)
          confirmed = findings.flat_map { |_, f| f.value }.uniq
          page, best = findings.max_by { |_, f| f.value.size }
          verdict = (Array(ours) - confirmed).empty? ? "confirmed" : "partial"
          return attributes(verdict, page, best, value: confirmed)
        end

        agree, disagree = findings.partition { |_, f| same?(field, ours, f.value) }
        if disagree.empty?
          page, best = agree.max_by { |_, f| f.confidence }
          return attributes("confirmed", page, best)
        end
        page, best = disagree.max_by { |_, f| f.confidence }
        attributes(partial?(field, ours, best.value) && agree.empty? ? "partial" : "contradicted", page, best)
      end

      def confidence_min(field) = LISTS.key?(field) ? LIST_MIN : MIN_CONFIDENCE

      def attributes(verdict, page, finding, value: finding.value)
        { verdict:, source_value: value, confidence: finding.confidence.round(3), source: page.source, url: page.url,
          excerpt: page.quotable ? finding.excerpt.to_s.truncate(400).presence : nil }
      end

      def same?(field, ours, theirs)
        case field
        when "height_max_m", "spread_max_m"
          ours.to_f.positive? && theirs.to_f.positive? && (ours.to_f - theirs.to_f).abs <= 0.3 * [ ours.to_f, theirs.to_f ].max
        when "hardiness_zone" then ours.to_i == theirs.to_i
        when "flowering_months", "harvest_months" then Array(ours).map(&:to_i).sort == Array(theirs).map(&:to_i).sort
        when "plant_type" then ours == theirs || SAME_HABIT.any? { |group| group.include?(ours) && group.include?(theirs) }
        else ours.to_s == theirs.to_s
        end
      end

      # Months that overlap without matching: the page and the species agree in part.
      def partial?(field, ours, theirs)
        %w[flowering_months harvest_months].include?(field) && (Array(ours).map(&:to_i) & Array(theirs).map(&:to_i)).any?
      end

      # --- What the code prepares for Jev --------------------------------------

      def line_id(index) = format("S%03d", index)

      def split_lines(text)
        text.split(/(?<=[.!?])\s+(?=[\p{Lu}0-9«"(])|\n+/).map(&:strip).reject { |l| l.length < 3 }
            .map { |l| l.truncate(400) }.first(MAX_LINES)
      end

      def number_candidates(text)
        seen = {}
        text.to_enum(:scan, NUMBER).map { Regexp.last_match }.filter_map do |m|
          low = m[1].tr(",", ".").to_f
          high = m[2]&.tr(",", ".")&.to_f
          unit = m[3].downcase
          factor = unit.start_with?("c") ? 0.01 : unit.start_with?("f") ? 0.3048 : 1
          metres = ((high || low) * factor).round(2)
          next if metres <= 0 || metres > 150

          context = sentence_around(text, m.begin(0), m.end(0))
          next if seen[[ metres, context ]]

          seen[[ metres, context ]] = true
          { metres:, context:, snippet: "…#{context}… [value: #{m[0]}]" }
        end.first(40).each_with_index.map { |c, i| c.merge(id: "H#{i}") }
      end

      def zone_candidates(text)
        text.to_enum(:scan, ZONE).map { Regexp.last_match }.filter_map do |m|
          before = text[[ m.begin(0) - 12, 0 ].max...m.begin(0)]
          next if before.match?(/\bUK\b|europ/i) || m[0].match?(/\bUK\b/)

          zone = m[1].to_i
          next unless zone.between?(1, 13)

          context = sentence_around(text, m.begin(0), m.end(0))
          { zone:, context:, snippet: "…#{context}… [zone: #{m[0]}]" }
        end.uniq { |c| [ c[:zone], c[:context] ] }.first(20).each_with_index.map { |c, i| c.merge(id: "Z#{i}") }
      end

      # The sentence that carries a passage, shown as the proof: an excerpt cut
      # in the middle of a word proves nothing.
      def sentence_around(text, from, to)
        head = text.rindex(/[.!?\n]\s/, from)
        start = head && from - head < 220 ? head + 2 : [ from - 120, 0 ].max
        tail = text.index(/[.!?](\s|\z)|\n/, to)
        stop = tail && tail - to < 220 ? tail + 1 : [ to + 120, text.length ].min
        text[start...stop].gsub(/\s+/, " ").strip
      end

      # The months (1..12) of a sentence. PFAF says flowering and ripening in
      # one sentence (« in flower from April to May, and the seeds ripen from
      # July to August »): harvest reads after the word about ripening,
      # flowering before it.
      def months_in(sentence, kind)
        part = if kind == :harvest
          sentence[/#{RIPEN.source}.*\z/im] || sentence
        else
          from = sentence.index(FLOWER) or return []
          rest = sentence[from..]
          rest.split(RIPEN).first.to_s
        end
        hits = MONTHS.each_with_index.filter_map { |re, i| (m = part.match(re)) && [ i + 1, m.begin(0) ] }.sort_by(&:last).map(&:first)
        return [] if hits.empty?

        if hits.size == 2 && part.match?(/\b(to|until|through|à|au)\b|[–-]/i)
          from, to = hits
          return from <= to ? (from..to).to_a : (from..12).to_a + (1..to).to_a
        end
        hits.sort
      end
  end
end

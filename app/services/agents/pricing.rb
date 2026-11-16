module Agents
  # What a model costs, in US dollars per million tokens, to turn a run's
  # token counts into money for the team's monthly ceiling. The model is
  # chosen by Semisto, not by the team (pilot).
  module Pricing
    MODEL = "claude-opus-5-5".freeze
    EFFORT = :medium

    # input, output, cache read, cache write (5 minutes): USD per million tokens.
    RATES = {
      "claude-opus-5-5" => { input: 4.0, output: 20.0, cache_read: 0.2, cache_write: 5.0 }
    }.freeze

    # Millionths of a US dollar.
    def self.micros(model, input:, output:, cache_read: 0, cache_write: 0)
      rate = RATES.fetch(model.to_s) { RATES.fetch(MODEL) }
      (input * rate[:input] + output * rate[:output] + cache_read * rate[:cache_read] + cache_write * rate[:cache_write]).ceil
    end
  end
end

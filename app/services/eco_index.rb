# The EcoIndex of a page (ecoindex.fr, Green IT): a score out of 100 from
# three counts — elements in the page, HTTP requests and kilobytes
# transferred — each placed among the quantiles of the HTTP Archive, the
# page's elements weighing three times, its requests twice. The grade (A to
# G), the greenhouse gases (g CO2e) and the water (cl) per page view follow
# from the score.
#
#   EcoIndex.new(dom_elements: 324, requests: 34, kilobytes: 2055).score  # => 69
module EcoIndex
  QUANTILES = {
    dom: [ 0, 47, 75, 159, 233, 298, 358, 417, 476, 537, 603, 674, 753, 843, 949, 1076, 1237, 1459, 1801, 2479, 594_601 ],
    requests: [ 0, 2, 15, 25, 34, 42, 49, 56, 63, 70, 78, 86, 95, 105, 117, 130, 147, 170, 205, 281, 3920 ],
    size: [ 0, 1.37, 144.7, 319.53, 479.46, 631.97, 783.38, 937.91, 1098.62, 1265.47, 1448.32, 1648.27, 1876.08,
            2142.06, 2465.37, 2866.31, 3401.59, 4155.73, 5400.08, 8037.54, 223_212.26 ]
  }.freeze

  GRADES = { "A" => 80, "B" => 70, "C" => 55, "D" => 40, "E" => 25, "F" => 10 }.freeze

  Result = Data.define(:score, :grade, :ges_grams, :water_centiliters)

  def self.new(dom_elements:, requests:, kilobytes:)
    raw = 100 - 5 * (3 * quantile(:dom, dom_elements) + 2 * quantile(:requests, requests) + quantile(:size, kilobytes)) / 6.0
    raw = raw.clamp(0, 100)
    Result.new(score: raw.round, grade: grade(raw),
               ges_grams: (2 + 2 * (50 - raw) / 100).round(2), water_centiliters: (3 + 3 * (50 - raw) / 100).round(2))
  end

  def self.grade(score)
    GRADES.find { |_, floor| score > floor }&.first || "G"
  end

  def self.quantile(kind, value)
    steps = QUANTILES.fetch(kind)
    index = (1...steps.size).find { |i| value < steps[i] }
    return steps.size - 1 unless index
    index - 1 + (value - steps[index - 1]).to_f / (steps[index] - steps[index - 1])
  end
end

# What the design guard (script/design_lint.mjs) still tolerates, read from
# its baseline: totals per rule and the files with the most departures, so
# « Design » shows how far the migration to the « carnet » primitives is.
module Admin
  class DesignGuard
    RULES = %w[small-text native-confirm hex-color bare-button].freeze
    BASELINE = Rails.root.join("config/design_lint_baseline.tsv")

    def self.call(path = BASELINE) = new(path).call

    def initialize(path)
      @path = path
    end

    def call
      rows = entries
      by_file = rows.group_by { _1[:path] }.map do |path, list|
        { path:, counts: list.to_h { [ _1[:rule], _1[:count] ] }, total: list.sum { _1[:count] } }
      end
      {
        totals: RULES.index_with { |rule| rows.select { _1[:rule] == rule }.sum { _1[:count] } },
        files: by_file.sort_by { [ -_1[:total], _1[:path] ] }.first(20),
        fileCount: by_file.size
      }
    end

    private
      def entries
        return [] unless File.exist?(@path)
        File.readlines(@path, chomp: true).filter_map do |line|
          next if line.blank? || line.start_with?("#")
          rule, count, path = line.split("\t")
          { rule:, count: count.to_i, path: } if RULES.include?(rule)
        end
      end
  end
end

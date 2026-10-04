# Regulatory alerts of a map: fixed, sourced rules of the map's region
# (`regions.settings["regulatory_rules"]`, seeded per region) evaluated with
# PostGIS against the terrain boundary and the features. Never an opinion of
# a model: each alert names its rule and its source, and the interface marks
# them as indicative, to be checked with the municipality.
#
# A rule is a hash:
#   key        stable id, also the i18n key (drawing.alerts.rules.<key>)
#   check      max_area | max_total_area | min_boundary_distance | max_count
#   kinds      element kinds the rule applies to
#   max_m2     (max_area, max_total_area) area above which the alert is
#              raised, per element or summed over all of them
#   until_m2   (max_area, optional) area above which a stricter rule takes over
#   min_m      (min_boundary_distance) distance to the terrain limits
#   max        (max_count) number of elements above which the alert is raised
#   severity   info | warning
#   source     { label, url } (label names the article or rubric)
# Checks this version does not know are skipped, so a region can list rules
# ahead of the code (e.g. flood-prone areas once the hazard layer is wired).
class RegulatoryAlerts
  CHECKS = %w[max_area max_total_area min_boundary_distance max_count].freeze
  SEVERITIES = %w[info warning].freeze
  STATUSES = %w[active draft].freeze

  Alert = Data.define(:rule, :check, :severity, :feature_ids, :kind, :title, :explanation, :source) do
    def as_json(*)
      { rule:, check:, severity:, featureIds: feature_ids, kind:, title:, explanation:, source: }
    end
  end

  attr_reader :map, :rules

  def initialize(map, rules: nil)
    @map = map
    @rules = Array(rules || map.region&.setting(:regulatory_rules)).map { |r| r.to_h.deep_stringify_keys }
  end

  def alerts
    @alerts ||= rules.select { |r| CHECKS.include?(r["check"]) }.flat_map { |rule| evaluate(rule) }
  end

  def as_json(*)
    {
      alerts: alerts.map(&:as_json),
      rulesCount: rules.count { |r| CHECKS.include?(r["check"]) },
      boundary: map.boundary.present?
    }
  end

  private
    def evaluate(rule)
      case rule["check"]
      when "max_area" then max_area(rule)
      when "max_total_area" then max_total_area(rule)
      when "min_boundary_distance" then min_boundary_distance(rule)
      when "max_count" then max_count(rule)
      end
    end

    def features(rule)
      map.features.where(status: STATUSES, kind: Array(rule["kinds"]).map(&:to_s))
    end

    def max_area(rule)
      max = rule["max_m2"].to_f
      area = "ST_Area(map_features.geometry::geography)"
      scope = features(rule).where("ST_Dimension(map_features.geometry) = 2").where("#{area} > ?", max)
      # `until_m2`: a step below a stricter rule (no double alert).
      scope = scope.where("#{area} <= ?", rule["until_m2"].to_f) if rule["until_m2"].present?
      scope.order(:id).pluck(:id, :kind, Arel.sql(area))
        .map do |id, kind, value|
          build(rule, [ id ], kind, area: square_meters(value), max: square_meters(max))
        end
    end

    # All the elements together (e.g. greenhouses that « totalisent » 20 m²).
    def max_total_area(rule)
      max = rule["max_m2"].to_f
      rows = features(rule).where("ST_Dimension(map_features.geometry) = 2").order(:id)
        .pluck(:id, :kind, Arel.sql("ST_Area(map_features.geometry::geography)"))
      total = rows.sum(&:last)
      return [] if total <= max
      [ build(rule, rows.map(&:first), rows.first[1], count: rows.size, area: square_meters(total), max: square_meters(max)) ]
    end

    def min_boundary_distance(rule)
      return [] if map.boundary.blank?
      min = rule["min_m"].to_f
      distance = "ST_Distance(map_features.geometry::geography, ST_Boundary(maps.boundary)::geography)"
      features(rule).joins(:map).where("#{distance} < ?", min)
        .order(:id).pluck(:id, :kind, Arel.sql(distance))
        .map do |id, kind, value|
          build(rule, [ id ], kind, distance: meters(value), min: meters(min))
        end
    end

    def max_count(rule)
      max = rule["max"].to_i
      rows = features(rule).order(:id).pluck(:id, :kind)
      return [] if rows.size <= max
      [ build(rule, rows.map(&:first), rows.first.last, count: rows.size, max:) ]
    end

    def build(rule, ids, kind, **values)
      label = MapElements.label(kind)
      vars = values.merge(kind: label.downcase_first, kind_name: label)
      Alert.new(
        rule: rule["key"].to_s,
        check: rule["check"],
        severity: SEVERITIES.include?(rule["severity"]) ? rule["severity"] : "warning",
        feature_ids: ids,
        kind:,
        title: text(rule, "title", vars),
        explanation: text(rule, "explanation", vars),
        source: rule["source"].is_a?(Hash) ? rule["source"].slice("label", "url") : nil
      )
    end

    def text(rule, part, vars)
      I18n.t("drawing.alerts.rules.#{rule["key"]}.#{part}",
        default: I18n.t("drawing.alerts.checks.#{rule["check"]}.#{part}", **vars), **vars)
    end

    def square_meters(value) = "#{number(value, 0)} m²"
    def meters(value) = "#{number(value, 1)} m"

    def number(value, precision)
      ActiveSupport::NumberHelper.number_to_rounded(value, precision:, delimiter: " ", separator: ",", strip_insignificant_zeros: true)
    end
end

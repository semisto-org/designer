# An infiltration test (`kind: infiltration_test`): the readings a person
# took in the field, and the rate the server derives from them
# (Infiltration::Measurement), so the rain simulation, the catchments and
# any AI read the same figure.
module MapFeature::InfiltrationTest
  extend ActiveSupport::Concern

  INFILTRATION_KIND = "infiltration_test".freeze
  # Earlier results at the same place (« Recommencer un test ici »).
  HISTORY_MAX = 20

  included do
    before_validation :measure_infiltration, if: :infiltration_test?
    validate :infiltration_readings_are_valid, if: :infiltration_test?
  end

  def infiltration_test? = kind == INFILTRATION_KIND

  def infiltration_rate_mm_h
    infiltration_test? ? properties.to_h["rate_mm_h"]&.to_f : nil
  end

  private
    def measure_infiltration
      p = (properties || {}).to_h.dup
      readings = Infiltration::Measurement.clean_readings(p["readings"])
      return if readings.nil?

      readings.empty? ? p.delete("readings") : p["readings"] = readings
      p.delete("started_at") unless valid_time?(p["started_at"])
      history = Array(p["history"]).select { |e| e.is_a?(Hash) && valid_time?(e["on"]) && e["rate_mm_h"].is_a?(Numeric) }
      history = history.last(HISTORY_MAX).map { |e| { "on" => e["on"], "rate_mm_h" => e["rate_mm_h"].to_f.round(1) } }
      history.empty? ? p.delete("history") : p["history"] = history
      result = Infiltration::Measurement.new(method: p["method"], diameter_cm: p["hole_diameter_cm"], readings:).call
      if result.rate_mm_h
        p["rate_mm_h"] = result.rate_mm_h
        p["rate_stable"] = result.stable
      else
        p.delete("rate_mm_h")
        p.delete("rate_stable")
      end
      self.properties = p
    end

    def infiltration_readings_are_valid
      return unless Infiltration::Measurement.clean_readings(properties.to_h["readings"]).nil?

      errors.add(:base, I18n.t("infiltration.errors.readings"))
    end

    def valid_time?(value)
      value.is_a?(String) && Time.iso8601(value).present?
    rescue ArgumentError
      false
    end
end

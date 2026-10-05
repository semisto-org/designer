# A point placed from the phone's GPS keeps how precise the fix was
# (properties.gps_accuracy_m, in meters). A phone is precise to 3–5 m in the
# open and often 10 m or worse under trees, so the editor flags the points
# beyond CHECK_ABOVE_M until someone looks at them: moving the point by hand,
# or saying it is well placed, sets properties.gps_checked.
module GpsFix
  extend ActiveSupport::Concern

  CHECK_ABOVE_M = 10

  included do
    before_validation :normalize_gps_properties
    before_save :mark_gps_checked, if: -> { persisted? && gps_accuracy_m && will_save_change_to_geometry? }
  end

  def gps_accuracy_m
    properties.is_a?(Hash) ? properties["gps_accuracy_m"] : nil
  end

  def gps_to_check?
    accuracy = gps_accuracy_m
    accuracy.present? && accuracy > CHECK_ABOVE_M && properties["gps_checked"] != true
  end

  private
    def normalize_gps_properties
      return unless properties.is_a?(Hash) && (properties.key?("gps_accuracy_m") || properties.key?("gps_checked"))

      props = properties.dup
      accuracy = Float(props["gps_accuracy_m"], exception: false)
      if accuracy&.positive? && accuracy.finite? then props["gps_accuracy_m"] = accuracy.round(1)
      else props.delete("gps_accuracy_m")
      end
      if props["gps_accuracy_m"] && ActiveModel::Type::Boolean.new.cast(props["gps_checked"]) then props["gps_checked"] = true
      else props.delete("gps_checked")
      end
      self.properties = props
    end

    def mark_gps_checked
      self.properties = properties.merge("gps_checked" => true)
    end
end

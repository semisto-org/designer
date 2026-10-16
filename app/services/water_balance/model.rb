module WaterBalance
  # The water balance of a place, month by month, from its observed climate:
  # the rain that falls, what a well-fed plant cover gives back to the air
  # (reference evapotranspiration, Hargreaves & Samani 1985, from the daily
  # minimum and maximum and the sun at that latitude), and the soil's useful
  # reserve in between (Thornthwaite & Mather 1955 bucket: when the rain is
  # short, plants draw on the reserve, harder and harder as it empties).
  #
  # - surplus: rain the full soil cannot hold, which runs off or recharges
  #   the groundwater: what swales and ponds can keep on the land;
  # - deficit: what plants would transpire and cannot find: the summer
  #   thirst that mulch, shade, swales and stored water have to cover.
  #
  # Orders of magnitude, in mm (= litres per m²). Hargreaves overestimates a
  # little in humid climates; plain Ruby, no I/O.
  class Model
    DAYS = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ].freeze
    MID_DAY = [ 15, 46, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344 ].freeze
    SPIN_UP_YEARS = 3
    # A month counts as dry above this deficit (mm).
    DRY_MM = 5

    # `months`: 12 hashes with rain_mm, mean_temp_c, mean_min_c, mean_max_c
    # (symbol or string keys, as ObservedClimate::Indicators gives them).
    def initialize(months:, latitude:, reserve_mm:)
      @months = months.map { |m| m.to_h.transform_keys(&:to_s) }
      @latitude = latitude.to_f
      @reserve = reserve_mm.to_f
    end

    def call
      pet = @months.each_with_index.map { |m, i| evapotranspiration(m, i) }
      soil = @reserve
      rows = []
      SPIN_UP_YEARS.times do
        rows = @months.each_with_index.map do |m, i|
          rain = m["rain_mm"].to_f
          balance = rain - pet[i]
          before = soil
          surplus = 0.0
          if balance >= 0
            soil += balance
            surplus = [ soil - @reserve, 0 ].max
            soil = [ soil, @reserve ].min
          else
            soil = @reserve.positive? ? soil * Math.exp(balance / @reserve) : 0.0
          end
          actual = balance >= 0 ? pet[i] : rain + (before - soil)
          { month: i + 1, rain_mm: rain.round, pet_mm: pet[i].round, aet_mm: actual.round, soil_mm: soil.round,
            surplus_mm: surplus.round, deficit_mm: (pet[i] - actual).round }
        end
      end
      {
        months: rows,
        reserve_mm: @reserve.round,
        annual: {
          rain_mm: rows.sum { _1[:rain_mm] }, pet_mm: rows.sum { _1[:pet_mm] },
          surplus_mm: rows.sum { _1[:surplus_mm] }, deficit_mm: rows.sum { _1[:deficit_mm] }
        },
        dry_months: rows.select { _1[:deficit_mm] > DRY_MM }.map { _1[:month] }
      }
    end

    private
      # Hargreaves–Samani reference evapotranspiration of a month, in mm.
      def evapotranspiration(month, index)
        tmean = month["mean_temp_c"]
        tmin = month["mean_min_c"]
        tmax = month["mean_max_c"]
        return 0.0 unless tmean && tmin && tmax

        daily = 0.0023 * 0.408 * radiation(MID_DAY[index]) * (tmean.to_f + 17.8) * Math.sqrt([ tmax.to_f - tmin.to_f, 0 ].max)
        [ daily, 0 ].max * DAYS[index]
      end

      # Extraterrestrial radiation (MJ/m²/day), FAO-56 equation 21.
      def radiation(day)
        phi = @latitude * Math::PI / 180
        dr = 1 + 0.033 * Math.cos(2 * Math::PI * day / 365)
        delta = 0.409 * Math.sin(2 * Math::PI * day / 365 - 1.39)
        omega = Math.acos((-Math.tan(phi) * Math.tan(delta)).clamp(-1.0, 1.0))
        24 * 60 / Math::PI * 0.0820 * dr * (omega * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(omega))
      end
  end
end

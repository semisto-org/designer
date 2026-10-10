module Sun
  # Position of the sun in the sky, after the NOAA solar calculator
  # (https://gml.noaa.gov/grad/solcalc/calcdetails.html, itself from Jean
  # Meeus, "Astronomical Algorithms"). Accurate to well under a degree
  # between 1901 and 2099, far more than a garden needs.
  #
  # Times are LOCAL SOLAR TIME (12:00 = the sun due south): the panel speaks
  # of "the sun at noon", not of clock times and daylight saving.
  #
  # Azimuths are compass bearings (0 = north, 90 = east, 180 = south),
  # elevations in degrees above a flat horizon, corrected for atmospheric
  # refraction (what the eye sees).
  module SolarPosition
    Position = Data.define(:azimuth, :elevation)

    module_function

    # Sun position at a place, for a date and a local solar time in hours.
    def at(lat:, lng:, date:, solar_hours:)
      # Universal time of this solar time, ignoring the equation of time
      # (a few minutes, i.e. a few hundredths of a degree of declination).
      jd = julian_day(date) + (solar_hours - lng / 15.0) / 24.0
      decl = declination(jd)
      hour_angle = 15.0 * (solar_hours - 12.0)

      lat_r, decl_r, ha_r = rad(lat), rad(decl), rad(hour_angle)
      cos_zenith = (Math.sin(lat_r) * Math.sin(decl_r) + Math.cos(lat_r) * Math.cos(decl_r) * Math.cos(ha_r)).clamp(-1.0, 1.0)
      zenith = Math.acos(cos_zenith)
      elevation = 90.0 - deg(zenith)

      Position.new(azimuth: azimuth(lat_r, decl_r, zenith, hour_angle).round(2), elevation: (elevation + refraction(elevation)).round(2))
    end

    # Solar declination in degrees for a Julian day.
    def declination(jd)
      t = (jd - 2_451_545.0) / 36_525.0
      mean_long = (280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360
      anomaly = rad(357.52911 + t * (35_999.05029 - 0.0001537 * t))
      center = Math.sin(anomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
        Math.sin(2 * anomaly) * (0.019993 - 0.000101 * t) + Math.sin(3 * anomaly) * 0.000289
      omega = rad(125.04 - 1934.136 * t)
      apparent_long = rad(mean_long + center - 0.00569 - 0.00478 * Math.sin(omega))
      mean_obliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
      obliquity = rad(mean_obliquity + 0.00256 * Math.cos(omega))
      deg(Math.asin(Math.sin(obliquity) * Math.sin(apparent_long)))
    end

    # Julian day at 0:00 UT of a date.
    def julian_day(date) = date.jd - 0.5

    def azimuth(lat_r, decl_r, zenith, hour_angle)
      sin_zenith = Math.sin(zenith)
      return 180.0 if sin_zenith.abs < 1e-9 || Math.cos(lat_r).abs < 1e-9

      cos_az = ((Math.sin(lat_r) * Math.cos(zenith)) - Math.sin(decl_r)) / (Math.cos(lat_r) * sin_zenith)
      angle = deg(Math.acos(cos_az.clamp(-1.0, 1.0)))
      hour_angle.positive? ? (angle + 180) % 360 : (540 - angle) % 360
    end

    # NOAA's approximation of atmospheric refraction, in degrees.
    def refraction(elevation)
      return 0.0 if elevation > 85

      tan_e = Math.tan(rad(elevation))
      arc_seconds =
        if elevation > 5 then 58.1 / tan_e - 0.07 / tan_e**3 + 0.000086 / tan_e**5
        elsif elevation > -0.575 then 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)))
        else -20.772 / tan_e
        end
      arc_seconds / 3600.0
    end

    def rad(degrees) = degrees * Math::PI / 180
    def deg(radians) = radians * 180 / Math::PI
  end
end

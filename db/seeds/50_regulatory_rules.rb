# Regulatory alert rules per region (map-drawing). Fixed and sourced: see
# RegulatoryAlerts. The interface marks every alert as indicative, to be
# checked with the municipality.
#
# Wallonia: CoDT exemptions from the planning permit ("petits permis et
# dispenses", SPW Territoire). A garden pond is exempt only if it is the only
# one on the property, at least 3 m from the limits and at most 100 m²; a
# greenhouse or garden shed at most 20 m². Constructions near the limits are
# flagged at 3 m too (distances vary by construction: indicative only).
codt = {
  "label" => "SPW Territoire, « CoDT : petits permis et dispenses »",
  "url" => "https://territoire.wallonie.be/storage/territoire/documents/content/page/mon-projet/codt-petits-permis-.pdf"
}

wallonia_rules = [
  { "key" => "pond_max_area", "check" => "max_area", "kinds" => %w[pond], "max_m2" => 100, "severity" => "warning", "source" => codt },
  { "key" => "pond_boundary_distance", "check" => "min_boundary_distance", "kinds" => %w[pond], "min_m" => 3, "severity" => "warning", "source" => codt },
  { "key" => "pond_single", "check" => "max_count", "kinds" => %w[pond], "max" => 1, "severity" => "info", "source" => codt },
  { "key" => "small_building_max_area", "check" => "max_area", "kinds" => %w[greenhouse shelter shed], "max_m2" => 20, "severity" => "warning", "source" => codt },
  { "key" => "construction_boundary_distance", "check" => "min_boundary_distance", "kinds" => %w[greenhouse shelter shed poultry_house], "min_m" => 3, "severity" => "info", "source" => codt }
]

if (wallonia = Region.find_by(key: "wallonia"))
  wallonia.update!(settings: wallonia.settings.merge("regulatory_rules" => wallonia_rules))
end

# Regulatory alert rules per region (map-drawing). Fixed and sourced: see
# RegulatoryAlerts. The interface marks every alert as indicative, to be
# checked with the municipality. Each source label names the article or the
# rubric the threshold comes from.
#
# Wallonia: CoDT, regulatory part, art. R.IV.1-1 (acts exempt from the
# planning permit), as replaced by the AGW of 10 April 2025, in force since
# 1 May 2025. Every rubric below also requires the spot to be outside a high
# flood hazard zone, which these checks cannot test yet.
#   G1  garden shed: one per property, at least 1 m from the limits, 20 m² max
#   I1  pond: one per property, at least 3 m from the limits, 100 m² max
#   I2  ponds outside the housing zones of the plan de secteur and outside
#       protected sites: up to 10 per property (2 per ha), 300 m² each, 3 m
#   I3  any other pond: permit « d'impact limité »
#   J5  garden greenhouses: 20 m² in total, no distance condition
#   N2  animal shelters: at least 3 m from the limits and 20 m from any
#       neighbouring house, 20 m² in total (the poultry house is a point on
#       the map, so only the distance is checked)
codt_url = "https://territoire.wallonie.be/storage/territoire/documents/content/page/codt/codt-r-iv-1-1.pdf"
codt = ->(rubric) { { "label" => "CoDT, art. R.IV.1-1, rubrique #{rubric} (AGW du 10 avril 2025, en vigueur depuis le 1er mai 2025)", "url" => codt_url } }

wallonia_rules = [
  { "key" => "pond_max_area", "check" => "max_area", "kinds" => %w[pond], "max_m2" => 100, "until_m2" => 300, "severity" => "warning", "source" => codt.("I1 et I2") },
  { "key" => "pond_max_area_absolute", "check" => "max_area", "kinds" => %w[pond], "max_m2" => 300, "severity" => "warning", "source" => codt.("I2 et I3") },
  { "key" => "pond_boundary_distance", "check" => "min_boundary_distance", "kinds" => %w[pond], "min_m" => 3, "severity" => "warning", "source" => codt.("I1 et I2") },
  { "key" => "pond_single", "check" => "max_count", "kinds" => %w[pond], "max" => 1, "severity" => "info", "source" => codt.("I1 et I2") },
  { "key" => "pond_max_count", "check" => "max_count", "kinds" => %w[pond], "max" => 10, "severity" => "warning", "source" => codt.("I2") },
  { "key" => "shed_max_area", "check" => "max_area", "kinds" => %w[shelter shed], "max_m2" => 20, "severity" => "warning", "source" => codt.("G1") },
  { "key" => "shed_boundary_distance", "check" => "min_boundary_distance", "kinds" => %w[shelter shed], "min_m" => 1, "severity" => "warning", "source" => codt.("G1") },
  { "key" => "shed_single", "check" => "max_count", "kinds" => %w[shelter shed], "max" => 1, "severity" => "info", "source" => codt.("G1") },
  { "key" => "greenhouse_total_area", "check" => "max_total_area", "kinds" => %w[greenhouse], "max_m2" => 20, "severity" => "warning", "source" => codt.("J5") },
  { "key" => "animal_shelter_boundary_distance", "check" => "min_boundary_distance", "kinds" => %w[poultry_house], "min_m" => 3, "severity" => "warning", "source" => codt.("N2") }
]

if (wallonia = Region.find_by(key: "wallonia"))
  wallonia.update!(settings: wallonia.settings.merge("regulatory_rules" => wallonia_rules))
end

# France: Code de l'urbanisme. A garden shed or shelter is exempt up to
# 5 m² (art. R*421-2 a), needs a prior declaration from 5 to 20 m²
# (art. R421-9 a) and a building permit beyond 20 m² (art. R*421-1; the
# 40 m² threshold of urban PLU zones is for extensions of an existing
# building only). Greenhouses: declaration from 1.80 m high up to 4 m and
# 2,000 m², permit beyond (R*421-2 e, R421-9); the height is not checked,
# the area is. Ponds: no planning rubric, but the water law asks for a
# declaration for a plan d'eau over 0.1 ha (Code de l'environnement,
# art. R214-1, rubric 3.2.3.0).
urbanisme = {
  "label" => "Code de l'urbanisme, art. R*421-1, R*421-2 et R421-9 (fiche Service-Public « Abri de jardin »)",
  "url" => "https://www.service-public.gouv.fr/particuliers/vosdroits/F662"
}
greenhouse = {
  "label" => "Code de l'urbanisme, art. R*421-2 e) et R421-9 (fiche Service-Public « Serre »)",
  "url" => "https://www.service-public.gouv.fr/particuliers/vosdroits/F36780"
}
water_law = {
  "label" => "Code de l'environnement, art. R214-1, rubrique 3.2.3.0 (plans d'eau)",
  "url" => "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048136763"
}
france_rules = [
  { "key" => "fr_shed_declaration", "check" => "max_area", "kinds" => %w[shelter shed], "max_m2" => 5, "until_m2" => 20, "severity" => "info", "source" => urbanisme },
  { "key" => "fr_shed_permit", "check" => "max_area", "kinds" => %w[shelter shed], "max_m2" => 20, "severity" => "warning", "source" => urbanisme },
  { "key" => "fr_greenhouse_permit", "check" => "max_area", "kinds" => %w[greenhouse], "max_m2" => 2000, "severity" => "warning", "source" => greenhouse },
  { "key" => "fr_pond_water_law", "check" => "max_area", "kinds" => %w[pond], "max_m2" => 1000, "severity" => "info", "source" => water_law }
]

if (france = Region.find_by(key: "france"))
  france.update!(settings: france.settings.merge("regulatory_rules" => france_rules))
end

# Luxembourg: no national rule. Each commune lists the small works exempt
# from the building permit in its own règlement sur les bâtisses (guichet.lu,
# « Autorisation de construire »), so nothing is seeded.

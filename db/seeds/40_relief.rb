# Relief and water defaults per region (feature area "relief-water").
# Idempotent: merges two keys into the region settings, leaves the others.
#
# Wallonia: the SPW's LiDAR models and land cover, sampled through ArcGIS
# REST `identify` (see Providers::ArcgisElevation), and hydrology orders of
# magnitude for Walloon loamy soils. Land cover rates/storage come from
# Claudy's rain model (orders of magnitude from runoff models, not
# measurements): they only make the simulation indicative.
spw = "https://geoservices.wallonie.be/arcgis/rest/services"

if (wallonia = Region.find_by(key: "wallonia"))
  wallonia.settings = wallonia.settings.merge(
    "relief" => {
      "provider" => "arcgis_elevation",
      "label" => "Géoportail de la Wallonie (SPW)",
      "attribution" => "© SPW — Géoportail de la Wallonie (MNT/MNS LiDAR 2021-2022, WalOUS 2023, ortho 2026)",
      "timezone" => "Europe/Brussels",
      "margin_m" => 150,
      "chunk" => 20_000,
      "threads" => 3,
      "datasets" => {
        "terrain" => { "url" => "#{spw}/RELIEF/WALLONIE_MNT_2021_2022/MapServer", "label" => "SPW, MNT LiDAR 2021-2022 (50 cm, terrain nu)" },
        "surface" => { "url" => "#{spw}/RELIEF/WALLONIE_MNS_2021_2022/MapServer", "label" => "SPW, MNS LiDAR 2021-2022 (arbres et toits)" },
        "landcover" => { "url" => "#{spw}/SOL_SOUS_SOL/WAL_OCS_IA__2023/MapServer", "label" => "SPW, occupation du sol WalOUS 2023 (IA)" },
        "texture" => { "url" => "#{spw}/IMAGERIE/ORTHO_2026_PRINTEMPS/MapServer", "label" => "SPW, orthophoto printemps 2026" }
      },
      # WalOUS 2023 codes (deduced in Claudy by crossing 2,500 points with
      # vegetation height; the service legend omits them). rate: what the
      # soil drinks (mm/h), storage: what it holds before saturating (mm).
      "landcover_classes" => {
        "1" => { "label" => "Revêtement artificiel", "rate" => 1, "storage" => 1, "color" => "#787878" },
        "2" => { "label" => "Bâti", "rate" => 0, "storage" => 0, "color" => "#be463c" },
        "3" => { "label" => "Rail", "rate" => 10, "storage" => 30, "color" => "#5a505a" },
        "4" => { "label" => "Sol nu", "rate" => 5, "storage" => 25, "color" => "#c4a06e" },
        "5" => { "label" => "Eau", "rate" => 0, "storage" => 0, "color" => "#286ec8" },
        "6" => { "label" => "Culture annuelle", "rate" => 8, "storage" => 40, "color" => "#e6c85a" },
        "7" => { "label" => "Prairie permanente", "rate" => 15, "storage" => 50, "color" => "#96c864" },
        "8" => { "label" => "Résineux (> 3 m)", "rate" => 30, "storage" => 70, "color" => "#1e5a3c" },
        "9" => { "label" => "Feuillus (> 3 m)", "rate" => 50, "storage" => 80, "color" => "#3c823c" },
        "80" => { "label" => "Résineux (≤ 3 m)", "rate" => 20, "storage" => 60, "color" => "#5a8c64" },
        "90" => { "label" => "Feuillus (≤ 3 m)", "rate" => 30, "storage" => 60, "color" => "#78aa5a" }
      }
    },
    "hydrology" => {
      # Belgian mean annual rainfall is ~850 mm (IRM normals 1991-2020 range
      # from ~750 mm in the north to >1,200 mm in the Ardennes).
      "annual_rainfall_mm" => 850,
      "roof_coefficient" => 0.8,
      "soil" => "loam",
      "uniform_rate_mm_h" => 10,
      "storage_mm" => 50,
      "percolation_mm_h" => 0.5,
      "soils" => {
        "clay" => { "rate_factor" => 0.4, "storage_factor" => 1.2 },
        "loam" => { "rate_factor" => 1.0, "storage_factor" => 1.0 },
        "stony" => { "rate_factor" => 1.4, "storage_factor" => 0.8 },
        "sandy" => { "rate_factor" => 2.5, "storage_factor" => 0.6 }
      }
    }
  )
  wallonia.save!
end

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
      # soil drinks (mm/h), storage: what it holds before saturating (mm),
      # kind: what the 3D view's blocks and Niva read it as (road, building,
      # water, forest; none = grass).
      "landcover_classes" => {
        "1" => { "label" => "Revêtement artificiel", "rate" => 1, "storage" => 1, "color" => "#787878", "kind" => "road" },
        "2" => { "label" => "Bâti", "rate" => 0, "storage" => 0, "color" => "#be463c", "kind" => "building" },
        "3" => { "label" => "Rail", "rate" => 10, "storage" => 30, "color" => "#5a505a" },
        "4" => { "label" => "Sol nu", "rate" => 5, "storage" => 25, "color" => "#c4a06e" },
        "5" => { "label" => "Eau", "rate" => 0, "storage" => 0, "color" => "#286ec8", "kind" => "water" },
        "6" => { "label" => "Culture annuelle", "rate" => 8, "storage" => 40, "color" => "#e6c85a" },
        "7" => { "label" => "Prairie permanente", "rate" => 15, "storage" => 50, "color" => "#96c864" },
        "8" => { "label" => "Résineux (> 3 m)", "rate" => 30, "storage" => 70, "color" => "#1e5a3c", "kind" => "forest" },
        "9" => { "label" => "Feuillus (> 3 m)", "rate" => 50, "storage" => 80, "color" => "#3c823c", "kind" => "forest" },
        "80" => { "label" => "Résineux (≤ 3 m)", "rate" => 20, "storage" => 60, "color" => "#5a8c64", "kind" => "forest" },
        "90" => { "label" => "Feuillus (≤ 3 m)", "rate" => 30, "storage" => 60, "color" => "#78aa5a", "kind" => "forest" }
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

# Europe (inherited by every region without its own relief): the Copernicus
# DEM GLO-30, read from its open data COGs on AWS (Providers::CopernicusDem).
# A 30 m SURFACE model, trees and roofs included: indicative only. Licence:
# Copernicus DEM, free including commercial use, with this attribution.
# Hydrology: the soil model without a rainfall figure (no single value makes
# sense for a continent; a map can set its own).
if (europe = Region.find_by(key: Region::EUROPE_KEY))
  europe.settings = europe.settings.merge(
    "relief" => {
      "provider" => "copernicus_dem",
      "label" => "Copernicus DEM GLO-30 (Europe)",
      "attribution" => "© DLR e.V. 2010-2014 et © Airbus Defence and Space GmbH 2014-2018, fourni sous COPERNICUS par l'Union européenne et l'ESA",
      "timezone" => "Europe/Brussels",
      "margin_m" => 150,
      "datasets" => {
        "terrain" => { "url" => "https://copernicus-dem-30m.s3.amazonaws.com",
                       "label" => "Copernicus DEM GLO-30 (30 m, modèle de surface : arbres et toits compris)" }
      }
    },
    "hydrology" => {
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
  europe.save!
end

# France: the IGN altimetry API (RGE ALTI, 1 m, bare ground; 5,000 points
# per request) and the IGN orthophoto under the relief
# (Providers::GeopfAltimetry). Licence Ouverte 2.0.
if (france = Region.find_by(key: "france"))
  france.settings = france.settings.merge(
    "relief" => {
      "provider" => "geopf_altimetry",
      "label" => "IGN – Géoplateforme (RGE ALTI)",
      "attribution" => "© IGN – Géoplateforme (RGE ALTI, BD ORTHO)",
      "timezone" => "Europe/Paris",
      "margin_m" => 150,
      "chunk" => 5_000,
      "threads" => 3,
      "datasets" => {
        "terrain" => { "url" => "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json",
                       "resource" => "ign_rge_alti_wld", "label" => "IGN, RGE ALTI (1 m, terrain nu)" },
        "texture" => { "url" => "https://data.geopf.fr/wms-r", "layers" => "HR.ORTHOIMAGERY.ORTHOPHOTOS",
                       "label" => "IGN, BD ORTHO (photo aérienne)" }
      }
    }
  )
  france.save!
end

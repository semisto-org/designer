# What a drone pilot of the directory flies and what a mission can bring
# back to a map. Names and descriptions live in config/locales/drone_pilots.fr.yml
# (drone_pilots.drones.*, drone_pilots.data_types.*).
#
# Data types are what DJI's aircraft and their software produce, and what
# Terranova can take in:
# - photos, video, panorama: the aircraft's own files (JPEG with DJI's XMP
#   metadata, MP4), added as photos of the map;
# - orthophoto, elevation (surface or terrain model), thermal and
#   multispectral (NDVI…): GeoTIFF rasters made by photogrammetry (DJI Terra,
#   WebODM, Pix4D…), imported as drone views (AerialView#product);
# - point_cloud (LAS/LAZ) and model_3d (OBJ, glTF, PLY…): kept as files of
#   the mission, to download.
#
# Every camera drone can make the photogrammetric products; thermal and
# multispectral need their sensor. RTK gives centimetre positions, LiDAR
# sees the ground under the trees (a terrain model of a wooded place).
module DroneCatalog
  DATA_TYPES = %w[photos video panorama orthophoto elevation thermal multispectral point_cloud model_3d].freeze
  PHOTOGRAMMETRY = %w[photos video panorama orthophoto elevation point_cloud model_3d].freeze
  FEATURES = %w[rtk thermal multispectral lidar].freeze

  # DJI aircraft and payloads, newest families first; "other" is any other
  # aircraft, named by the pilot.
  DRONES = {
    "mini" => [],
    "air" => [],
    "mavic_3" => [],
    "mavic_3_enterprise" => %w[rtk],
    "mavic_3_thermal" => %w[rtk thermal],
    "mavic_3_multispectral" => %w[rtk multispectral],
    "matrice_4e" => %w[rtk],
    "matrice_4t" => %w[rtk thermal],
    "matrice_30t" => %w[rtk thermal],
    "matrice_350_l2" => %w[rtk lidar],
    "matrice_350_p1" => %w[rtk],
    "matrice_350_h30t" => %w[rtk thermal],
    "phantom_4_rtk" => %w[rtk],
    "phantom_4_multispectral" => %w[rtk multispectral],
    "other" => []
  }.freeze

  # The European pilot certificates: open category A1/A3 (online test), A2
  # (certificate of competency), a standard scenario (STS) or an
  # operational authorisation in the specific category.
  CERTIFICATES = %w[a1_a3 a2 sts specific].freeze

  module_function

  def features_of(drones)
    Array(drones).flat_map { |drone| DRONES.fetch(drone["model"].to_s, []) }.uniq & FEATURES
  end

  # What a fleet can bring back. "other" drones are taken at the pilot's word.
  def possible_data_types(drones)
    models = Array(drones).map { _1["model"].to_s }
    return DATA_TYPES if models.include?("other")
    features = features_of(drones)
    types = models.any? ? PHOTOGRAMMETRY.dup : []
    types << "thermal" if features.include?("thermal")
    types << "multispectral" if features.include?("multispectral")
    DATA_TYPES & types
  end
end

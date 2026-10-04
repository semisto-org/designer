# Climate reference data per region (config/climate/<region key>.yml),
# stored in regions.settings["climate"] for Providers::Climate::Static.
# Idempotent: the file is the source of truth and replaces the stored copy,
# except the region-wide hardiness values an admin may have set by hand.
Dir[Rails.root.join("config/climate/*.yml")].sort.each do |file|
  region = Region.find_by(key: File.basename(file, ".yml"))
  next unless region

  kept = region.settings.fetch("climate", {}).slice("hardiness_zone", "min_temperature_c")
  region.update!(settings: region.settings.merge("climate" => kept.merge(YAML.load_file(file))))
end

# Climate reference data per region (config/climate/<region key>.yml),
# stored in regions.settings["climate"] for Providers::Climate::Static.
# Idempotent: the file is the source of truth and replaces the stored copy.
Dir[Rails.root.join("config/climate/*.yml")].sort.each do |file|
  region = Region.find_by(key: File.basename(file, ".yml"))
  next unless region

  region.update!(settings: region.settings.merge("climate" => YAML.load_file(file)))
end

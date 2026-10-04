# Hardiness zone of each seeded region (USDA, absolute minimum), read by the
# planting alerts and the palette suggestions. Set only when absent, so that
# an admin's value is never overwritten.
{ "wallonia" => 7, "france" => 8, "luxembourg" => 7 }.each do |key, zone|
  region = Region.find_by(key:)
  next unless region
  climate = region.settings.fetch("climate", {})
  next if climate["hardiness_zone"].present?
  region.update!(settings: region.settings.merge("climate" => climate.merge("hardiness_zone" => zone)))
end

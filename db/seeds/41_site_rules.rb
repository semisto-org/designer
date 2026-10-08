# Site rules per region (feature area "site_rules"): where the « Règles et
# risques » panel reads risks and town-planning rules. Idempotent: merges
# one key into the region settings, leaves the others.
#
# France: risks from Géorisques, zoning and easements from the Géoportail de
# l'urbanisme (IGN API Carto, module GPU).
# Wallonia: no provider yet; the panel points to the region layers that
# cover the subject.
{
  "france" => { "risks" => "georisques", "urbanism" => "gpu" },
  "wallonia" => { "layers" => %w[plan_secteur natura2000] }
}.each do |key, site_rules|
  region = Region.find_by(key:) or next
  region.update!(settings: region.settings.merge("site_rules" => site_rules))
end

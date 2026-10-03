namespace :catalog do
  desc "Import genera, species and varieties from Terranova (TERRANOVA_API_URL, TERRANOVA_API_TOKEN)"
  task import_terranova: :environment do
    provider = Providers::Terranova.new
    abort "TERRANOVA_API_TOKEN is not set: nothing imported." unless provider.configured?
    puts "Importing the plant catalogue from #{provider.base_url}…"
    result = Catalog::TerranovaImport.new(provider:).call
    puts "Done: #{result}"
    result.errors.first(20).each { |error| puts "  #{error}" }
  rescue Providers::Terranova::Unavailable => e
    abort "Terranova is unavailable: #{e.message}"
  end
end

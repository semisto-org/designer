namespace :catalog do
  desc "Import basket A of Terranova's species as species to review, with their genera and varieties (TERRANOVA_API_URL, TERRANOVA_API_TOKEN)"
  task import_terranova: :environment do
    provider = Providers::Terranova.new
    abort "TERRANOVA_API_TOKEN is not set: nothing imported." unless provider.configured?
    puts "Importing basket A of the plant catalogue from #{provider.base_url}…"
    result = Catalog::TerranovaImport.new(provider:).call
    puts "Done: #{result}"
    puts "New species wait in the review queue (/plants/review), most used first."
    result.conflicts.each { |name, field, ours, theirs| puts "  conflict #{name} #{field}: kept #{ours.inspect}, Terranova says #{theirs.inspect}" }
    result.errors.first(20).each { |error| puts "  #{error}" }
  rescue Providers::Terranova::Unavailable => e
    abort "Terranova is unavailable: #{e.message}"
  end

  desc "Sort Terranova's species into baskets A/B/C without importing anything (CSV=path also writes them all)"
  task triage_terranova: :environment do
    provider = Providers::Terranova.new
    abort "TERRANOVA_API_TOKEN is not set." unless provider.configured?
    triage = Catalog::TerranovaTriage.new(provider.each_species.to_a)
    puts "Baskets: #{triage.counts.map { "#{_1} #{_2}" }.join(', ')}"
    puts "Reasons: #{triage.entries.flat_map(&:reasons).tally.map { "#{_1} #{_2}" }.join(', ')}"
    triage.entries.select(&:match).each do |entry|
      entry.conflicts.each { |field, ours, theirs| puts "  conflict #{entry.latin_name} #{field}: Designer #{ours.inspect}, Terranova #{theirs.inspect}" }
    end
    if ENV["CSV"].present?
      require "csv"
      CSV.open(ENV["CSV"], "w") do |csv|
        csv << %w[basket reasons terranova_id latin_name usage audited designer_species conflicts]
        triage.entries.each do |e|
          csv << [ e.basket, e.reasons.join(" "), e.id, e.latin_name, e.usage, e.audited?, e.match&.id,
                   e.conflicts.map { |field, ours, theirs| "#{field}: #{ours} / #{theirs}" }.join("; ") ]
        end
      end
      puts "Written to #{ENV['CSV']}"
    end
  rescue Providers::Terranova::Unavailable => e
    abort "Terranova is unavailable: #{e.message}"
  end
end

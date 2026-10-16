# Starter plant catalogue: db/seeds/plants/*.yml (see Catalog::SeedLoader).
counts = Catalog::SeedLoader.new.call
puts "Plants: #{counts[:created]} created, #{counts[:updated]} updated" unless Rails.env.test?

# Plant lists of Semisto design projects, each under its own source.
Catalog::SeedLoader.project_paths.each do |path|
  counts = Catalog::SeedLoader.new([ path ], source: Catalog::SeedLoader.project_source(path)).call
  puts "Plants (#{File.basename(path, '.yml')}): #{counts[:created]} created, #{counts[:updated]} updated" unless Rails.env.test?
end

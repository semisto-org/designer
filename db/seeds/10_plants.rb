# Starter plant catalogue: db/seeds/plants/*.yml (see Catalog::SeedLoader).
counts = Catalog::SeedLoader.new.call
puts "Plants: #{counts[:created]} created, #{counts[:updated]} updated" unless Rails.env.test?

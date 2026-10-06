namespace :palette do
  desc "Import a Terranova palette export (CSV) into a map's palette: " \
       "MAP_ID=… FILE=export.csv (or FILE=- for stdin) [APPLY=1] [CREATE_MISSING=1]"
  task import_terranova: :environment do
    flag = ->(name) { ActiveModel::Type::Boolean.new.cast(ENV[name].presence) || false }
    abort "MAP_ID is missing." if ENV["MAP_ID"].blank?
    abort "FILE is missing (a Terranova palette export, or - for stdin)." if ENV["FILE"].blank?
    map = Map.find_by(id: ENV["MAP_ID"]) or abort "No map #{ENV['MAP_ID']}."
    csv = ENV["FILE"] == "-" ? $stdin.read : File.read(ENV["FILE"])

    importer = Imports::TerranovaPalette.new(map:, csv:, apply: flag.("APPLY"), create_missing: flag.("CREATE_MISSING")).call
    puts importer.report
    puts "\nNothing was written: add APPLY=1 to import." unless flag.("APPLY")
  rescue ArgumentError, CSV::MalformedCSVError => e
    abort e.message
  end
end

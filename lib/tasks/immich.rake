namespace :immich do
  desc "List the Immich project albums (name starting with 📍), with the Designer map their photos fall in: IMMICH_URL=… IMMICH_API_KEY=… [ALL=1]"
  task albums: :environment do
    I18n.with_locale(:fr) do
      client = Imports::Immich::Client.from_env
      abort I18n.t("immich_import.errors.not_configured") unless client.configured?
      albums = client.albums.sort_by { |album| Imports::Immich::Importer.map_album_name(album["albumName"]).downcase }
      unless ActiveModel::Type::Boolean.new.cast(ENV["ALL"].presence)
        projects = albums.select { |album| Imports::Immich::Importer.project_album?(album["albumName"]) }
        left_out = albums.size - projects.size
        puts I18n.t("immich_import.albums.left_out", count: left_out, mark: Imports::Immich::Importer::PROJECT_MARK) if left_out.positive?
        albums = projects
      end
      puts I18n.t("immich_import.albums.none") if albums.empty?
      albums.each do |album|
        assets = client.each_album_asset(album["id"]).to_a
        puts I18n.t("immich_import.albums.line", name: album["albumName"], id: album["id"], count: assets.size,
                    located: assets.count { |asset| Imports::Immich::Importer.position(asset) })
        suggestions = Imports::Immich::Importer.suggest_maps(assets)
        if suggestions.empty?
          puts I18n.t("immich_import.albums.no_map")
        else
          suggestions.first(3).each do |map, count|
            puts I18n.t("immich_import.albums.map", id: map.id, name: map.name, count:)
          end
          puts I18n.t("immich_import.albums.command", album: album["id"], map: suggestions.first.first.id)
        end
      rescue Imports::Immich::Error => error
        puts I18n.t("immich_import.albums.line_error", name: album["albumName"], message: error.message)
      end
    rescue Imports::Immich::Error => error
      abort error.message
    end
  end

  desc "Import the photos of one Immich album into a Designer map: ALBUM=<album id> MAP_ID=… [ALBUM_NAME=…] [DRY_RUN=1] [FORCE=1 for an album without 📍]"
  task import: :environment do
    I18n.with_locale(:fr) do
      abort I18n.t("immich_import.errors.album_missing") if ENV["ALBUM"].blank?
      abort I18n.t("claudy_import.errors.map_missing") if ENV["MAP_ID"].blank?
      map = Map.find_by(id: ENV["MAP_ID"]) or abort I18n.t("claudy_import.errors.map_not_found", id: ENV["MAP_ID"])
      client = Imports::Immich::Client.from_env
      abort I18n.t("immich_import.errors.not_configured") unless client.configured?
      flag = ->(name) { ActiveModel::Type::Boolean.new.cast(ENV[name].presence) || false }
      result = Imports::Immich::Importer.new(map:, client:, album_id: ENV["ALBUM"], album_name: ENV["ALBUM_NAME"],
                                             dry_run: flag.("DRY_RUN"), force: flag.("FORCE")).call
      puts Imports::Immich::Summary.new(result)
    rescue Imports::Immich::Error => error
      abort error.message
    end
  end
end

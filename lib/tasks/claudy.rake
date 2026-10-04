namespace :claudy do
  desc "Import the Claudy map plan (Les 4 Sources) into a Designer map: " \
       "MAP_ID=… [FILE=export.json | CLAUDY_API_URL=… CLAUDY_API_KEY=…] [DRY_RUN=1] [PHOTOS=0] [FORCE=1] [CLAUDY_NETWORK_LAYERS=5=water,…]"
  task import: :environment do
    flag = ->(name) { ActiveModel::Type::Boolean.new.cast(ENV[name].presence) || false }
    I18n.with_locale(:fr) do
      abort I18n.t("claudy_import.errors.map_missing") if ENV["MAP_ID"].blank?
      map = Map.find_by(id: ENV["MAP_ID"]) or abort I18n.t("claudy_import.errors.map_not_found", id: ENV["MAP_ID"])

      importer = nil
      begin
        source =
          if ENV["FILE"].present?
            Imports::Claudy::FileSource.new(ENV["FILE"])
          else
            client = Imports::Claudy::Client.from_env
            raise Imports::Claudy::Error.new(:not_configured) unless client.configured?
            Imports::Claudy::ApiSource.new(client)
          end
        importer = Imports::Claudy::Importer.new(
          map:, source:, dry_run: flag.("DRY_RUN"), photos: ENV["PHOTOS"].blank? || flag.("PHOTOS"), force: flag.("FORCE"),
          network_layers: Imports::Claudy::NetworkResolver.parse_overrides(ENV["CLAUDY_NETWORK_LAYERS"])
        )
        puts importer.call
      rescue Imports::Claudy::Error => error
        puts importer.report if importer&.report&.aborted
        abort error.message
      end
    end
  end
end

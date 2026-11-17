namespace :imports do
  desc "Import a My Semisto project chat into a map's discussion: " \
       "MAP_ID=… PROJECT_ID=… [RECORDING_ID=…] [AUTHORS=\"Name=email;12=email\"] [CONFIRM=oui-importer] " \
       "(MY_SEMISTO_API_TOKEN, MY_SEMISTO_API_URL). Dry run unless CONFIRM=oui-importer."
  task my_semisto_chat: :environment do
    I18n.with_locale(:fr) do
      abort I18n.t("my_semisto_import.errors.map_missing") if ENV["MAP_ID"].blank?
      abort I18n.t("my_semisto_import.errors.project_missing") if ENV["PROJECT_ID"].blank?
      map = Map.find_by(id: ENV["MAP_ID"]) or abort I18n.t("my_semisto_import.errors.map_not_found", id: ENV["MAP_ID"])

      authors = ENV["AUTHORS"].to_s.split(";").filter_map do |pair|
        next if pair.blank?
        key, email = pair.split("=", 2).map { |part| part.to_s.strip }
        abort I18n.t("my_semisto_import.errors.authors", value: ENV["AUTHORS"]) if key.blank? || email.blank?
        [ key, email ]
      end.to_h

      begin
        client = Imports::MySemisto::Client.from_env
        raise Imports::MySemisto::Error.new(:not_configured) unless client.configured?
        importer = Imports::MySemisto::ChatImporter.new(
          map:, client:, project_id: ENV["PROJECT_ID"], recording_id: ENV["RECORDING_ID"],
          confirm: ENV["CONFIRM"] == "oui-importer", author_mapping: authors
        )
        puts importer.call
      rescue Imports::MySemisto::Error => error
        abort error.message
      end
    end
  end
end

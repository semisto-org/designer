require "test_helper"
require_relative "../test_helpers/claudy_import_test_helper"

class ClaudyImportTaskTest < ActiveSupport::TestCase
  include ClaudyImportTestHelper

  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("claudy:import")
    @map = maps(:ahinvaux)
  end

  test "imports a file and prints the French summary" do
    with_env("MAP_ID" => @map.id.to_s, "FILE" => CLAUDY_FIXTURES.join("export/claudy-map.json").to_s, "DRY_RUN" => nil, "PHOTOS" => "0") do
      assert_output(/Import de Claudy dans « Domaine d'Ahinvaux ».*Photos : non importées/m) { Rake::Task["claudy:import"].execute }
    end
    assert imported(@map, "map_feature", 110)
    assert_equal 0, @map.photos.count
  end

  test "DRY_RUN=1 writes nothing" do
    with_env("MAP_ID" => @map.id.to_s, "FILE" => CLAUDY_FIXTURES.join("export/claudy-map.json").to_s, "DRY_RUN" => "1") do
      assert_no_difference -> { MapFeature.count } do
        assert_output(/Simulation \(DRY_RUN=1\)/) { Rake::Task["claudy:import"].execute }
      end
    end
  end

  test "reads the API from CLAUDY_API_URL and CLAUDY_API_KEY" do
    stub_claudy_api
    with_env("MAP_ID" => @map.id.to_s, "FILE" => nil, "CLAUDY_API_URL" => CLAUDY_HOST, "CLAUDY_API_KEY" => CLAUDY_KEY, "PHOTOS" => "0") do
      assert_output(/Source : API https:\/\/claudy\.test\/api\/v1/) { Rake::Task["claudy:import"].execute }
    end
    assert imported(@map, "plant", 7)
  end

  test "stops with a French message when something is missing" do
    with_env("MAP_ID" => nil) { assert_abort(/MAP_ID=/) }
    with_env("MAP_ID" => "0") { assert_abort(/Carte n° 0 introuvable/) }
    with_env("MAP_ID" => @map.id.to_s, "FILE" => nil, "CLAUDY_API_KEY" => nil) { assert_abort(/Aucune source/) }
    with_env("MAP_ID" => @map.id.to_s, "FILE" => "/nope.json") { assert_abort(/Fichier introuvable/) }
    with_env("MAP_ID" => @map.id.to_s, "FILE" => nil, "CLAUDY_API_KEY" => CLAUDY_KEY, "CLAUDY_NETWORK_LAYERS" => "x") { assert_abort(/CLAUDY_NETWORK_LAYERS illisible/) }
  end

  private
    def assert_abort(message)
      error = nil
      _, err = capture_io { error = assert_raises(SystemExit) { Rake::Task["claudy:import"].execute } }
      assert_equal 1, error.status
      assert_match message, err
    end

    def with_env(values)
      keys = %w[MAP_ID FILE DRY_RUN PHOTOS FORCE CLAUDY_API_URL CLAUDY_API_KEY CLAUDY_NETWORK_LAYERS]
      saved = keys.index_with { |key| ENV[key] }
      keys.each { |key| ENV.delete(key) }
      values.each { |key, value| ENV[key] = value unless value.nil? }
      yield
    ensure
      saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    end
end

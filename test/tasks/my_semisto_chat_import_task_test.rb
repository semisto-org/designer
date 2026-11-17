require "test_helper"

class MySemistoChatImportTaskTest < ActiveSupport::TestCase
  HOST = "https://my.semisto.test/api/v1".freeze
  KEYS = %w[MAP_ID PROJECT_ID RECORDING_ID AUTHORS CONFIRM MY_SEMISTO_API_URL MY_SEMISTO_API_TOKEN].freeze

  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("imports:my_semisto_chat")
    @map = maps(:ahinvaux)
    stub_request(:get, "#{HOST}/recordings/6782/lines").with(query: { offset: "0" })
      .to_return(status: 200, body: { lines: [ { id: 1, body: "Bonjour", author: "Michael", author_id: 1, created_at: "2025-01-01T10:00:00Z" } ] }.to_json)
    stub_request(:get, "#{HOST}/projects/166/people")
      .to_return(status: 200, body: { people: [ { id: 1, name: "Michael", first_name: "Michael", email: "michael@example.org" } ] }.to_json)
  end

  test "is a dry run without CONFIRM" do
    with_env(base_env) do
      assert_no_difference -> { Comment.count } do
        assert_output(/Simulation : rien n'est écrit.*CONFIRM=oui-importer/m) { run_task }
      end
    end
  end

  test "imports with CONFIRM=oui-importer" do
    with_env(base_env.merge("CONFIRM" => "oui-importer")) do
      assert_difference -> { Comment.count }, 1 do
        assert_output(/Fait : 1 messages importés/) { run_task }
      end
    end
  end

  test "any other CONFIRM value stays a dry run" do
    with_env(base_env.merge("CONFIRM" => "1")) do
      assert_no_difference -> { Comment.count } do
        assert_output(/Simulation/) { run_task }
      end
    end
  end

  test "stops with a French message when something is missing" do
    with_env({}) { assert_abort(/MAP_ID=/) }
    with_env("MAP_ID" => @map.id.to_s) { assert_abort(/PROJECT_ID=/) }
    with_env("MAP_ID" => "0", "PROJECT_ID" => "166") { assert_abort(/Carte n° 0 introuvable/) }
    with_env("MAP_ID" => @map.id.to_s, "PROJECT_ID" => "166") { assert_abort(/MY_SEMISTO_API_TOKEN/) }
    with_env(base_env.merge("AUTHORS" => "sans-egal")) { assert_abort(/AUTHORS illisible/) }
  end

  private
    def base_env
      { "MAP_ID" => @map.id.to_s, "PROJECT_ID" => "166", "RECORDING_ID" => "6782", "MY_SEMISTO_API_URL" => HOST, "MY_SEMISTO_API_TOKEN" => "secret" }
    end

    def run_task = Rake::Task["imports:my_semisto_chat"].execute

    def assert_abort(message)
      error = nil
      _, err = capture_io { error = assert_raises(SystemExit) { run_task } }
      assert_equal 1, error.status
      assert_match message, err
    end

    def with_env(values)
      saved = KEYS.index_with { |key| ENV[key] }
      KEYS.each { |key| ENV.delete(key) }
      values.each { |key, value| ENV[key] = value }
      yield
    ensure
      saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
    end
end

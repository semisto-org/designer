require "test_helper"

class Imports::MySemisto::ClientTest < ActiveSupport::TestCase
  HOST = "https://my.semisto.test/api/v1".freeze

  setup do
    @client = Imports::MySemisto::Client.new(url: "#{HOST}/", token: "secret", sleeper: ->(_) { })
  end

  test "reads every page of lines through offset, oldest first" do
    first = (1..100).map { |i| { id: 1000 - i, created_at: (Time.utc(2025, 1, 1) + (100 - i).hours).iso8601 } }
    second = [ { id: 1, created_at: Time.utc(2024, 12, 1).iso8601 } ]
    stub_lines({ offset: "0" }, first)
    stub_lines({ offset: "100" }, second)
    lines = @client.lines(6782)
    assert_equal 101, lines.size
    assert_equal 1, lines.first["id"]
  end

  test "adds thread replies that are not in the main flow" do
    stub_lines({ offset: "0" }, [ { id: 10, thread_replies_count: 1, created_at: "2025-01-01T10:00:00Z" } ])
    stub_lines({ offset: "0", thread_parent_id: "10" }, [ { id: 11, thread_parent_id: 10, created_at: "2025-01-01T11:00:00Z" } ])
    assert_equal [ 10, 11 ], @client.lines(6782).map { |line| line["id"] }
  end

  test "finds the project's Campfire" do
    stub_request(:get, "#{HOST}/recordings").with(query: { type: "Campfire", project_id: "166" })
      .to_return(status: 200, body: { recordings: [ { id: 6782, status: "active" } ] }.to_json)
    assert_equal 6782, @client.campfire_id(166)
  end

  test "says in French when the token is refused or missing" do
    stub_request(:get, "#{HOST}/projects/166/people").to_return(status: 401, body: "{}")
    error = assert_raises(Imports::MySemisto::Error) { @client.people(166) }
    assert_match "refuse le jeton", error.message
    assert_not Imports::MySemisto::Client.new(url: HOST, token: "").configured?
  end

  test "retries a server error" do
    stub_request(:get, "#{HOST}/projects/166/people").to_return({ status: 502 }, { status: 200, body: { people: [] }.to_json })
    assert_equal [], @client.people(166)
  end

  private
    def stub_lines(query, lines)
      stub_request(:get, "#{HOST}/recordings/6782/lines").with(query:, headers: { "Authorization" => "Bearer secret" })
        .to_return(status: 200, body: { lines: }.to_json)
    end
end

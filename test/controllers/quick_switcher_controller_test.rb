require "test_helper"

class QuickSwitcherControllerTest < ActionDispatch::IntegrationTest
  test "requires sign in" do
    get quick_switcher_path
    assert_redirected_to new_session_path
  end

  test "lists the maps I own, the ones shared with me and my teams' maps, newest first" do
    alice = users(:alice)
    team = Organization.create_with_admin!(users(:bob), name: "Bureau d'études")
    team.memberships.create!(user: alice, role: "member")
    team_map = Map.create!(name: "Walhain", owner: users(:bob), organization: team, address: "Walhain, Belgique")
    Map.create!(name: "Hors de portée", owner: users(:bob))
    archived = Map.create!(name: "Ancienne", owner: alice, archived_at: Time.current)

    sign_in_as alice
    get quick_switcher_path
    assert_response :success
    maps = response.parsed_body["maps"]
    names = maps.map { _1["name"] }

    assert_equal "Walhain", names.first
    assert_includes names, maps(:ahinvaux).name
    assert_not_includes names, "Hors de portée"
    assert_not_includes names, archived.name
    walhain = maps.first
    assert_equal({ "id" => team_map.id, "address" => "Walhain, Belgique", "role" => "editor", "teamName" => "Bureau d'études" },
      walhain.slice("id", "address", "role", "teamName"))
    assert_equal "viewer", maps.find { _1["id"] == maps(:ahinvaux).id }["role"]
  end

  test "the owner sees their map as theirs" do
    sign_in_as users(:michael)
    get quick_switcher_path
    ahinvaux = response.parsed_body["maps"].find { _1["id"] == maps(:ahinvaux).id }
    assert_equal "owner", ahinvaux["role"]
    assert_equal "design", ahinvaux["stage"]
  end

  test "the preview gives the terrain sketch and the next step of a map I can open" do
    sign_in_as users(:alice)
    get quick_switcher_map_path(maps(:ahinvaux))
    assert_response :success
    body = response.parsed_body
    assert_equal maps(:ahinvaux).name, body.dig("map", "name")
    assert body.dig("map", "boundary")
    assert body.dig("map", "sketch").key?("plants")
    assert_includes %w[item advance complete], body.dig("next", "type")
  end

  test "no preview of a map I cannot open" do
    other = Map.create!(name: "Hors de portée", owner: users(:bob))
    sign_in_as users(:alice)
    get quick_switcher_map_path(other)
    assert_response :not_found
  end
end

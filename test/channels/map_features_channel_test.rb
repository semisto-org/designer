require "test_helper"

class MapFeaturesChannelTest < ActionCable::Channel::TestCase
  test "editors and viewers of the map subscribe" do
    map = maps(:ahinvaux)
    stub_connection current_user: users(:michael)
    subscribe map_id: map.id
    assert subscription.confirmed?
    assert_has_stream_for map

    stub_connection current_user: users(:alice)
    subscribe map_id: map.id
    assert subscription.confirmed?
  end

  test "strangers and unknown maps are rejected" do
    stub_connection current_user: users(:bob)
    subscribe map_id: maps(:ahinvaux).id
    assert subscription.rejected?

    subscribe map_id: 0
    assert subscription.rejected?
  end

  test "archived maps are rejected" do
    maps(:ahinvaux).update!(archived_at: Time.current)
    stub_connection current_user: users(:michael)
    subscribe map_id: maps(:ahinvaux).id
    assert subscription.rejected?
  end

  test "feature changes are broadcast to the map" do
    map = maps(:ahinvaux)
    stream = MapFeaturesChannel.broadcasting_for(map)
    last = -> { JSON.parse(broadcasts(stream).last) }

    feature = map.features.create!(layer: "notes", kind: "note_point", geometry: point, created_by: users(:michael))
    assert_equal({ "action" => "upsert", "id" => feature.id, "actorId" => users(:michael).id }, last.call.except("feature"))
    assert_equal "note_point", last.call.dig("feature", "properties", "kind")

    feature.update!(name: "Ici", updated_by: users(:alice))
    message = last.call
    assert_equal [ "upsert", users(:alice).id ], message.values_at("action", "actorId")
    assert_equal "Ici", message.dig("feature", "properties", "name")

    feature.update!(status: "rejected")
    assert_equal({ "action" => "remove", "id" => feature.id, "actorId" => users(:alice).id, "feature" => nil }, last.call)

    feature.destroy!
    assert_equal 4, broadcasts(stream).size
    assert_equal "remove", last.call["action"]
  end
end

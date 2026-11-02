require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class MapChatChannelTest < ActionCable::Channel::TestCase
  setup do
    @map = maps(:ahinvaux)
  end

  test "the owner and editors join; a viewer only once let in" do
    stub_connection current_user: users(:michael)
    subscribe map_id: @map.id
    assert subscription.confirmed?
    assert_has_stream_for @map

    stub_connection current_user: users(:alice)
    subscribe map_id: @map.id
    assert subscription.rejected?, "a viewer is not in the discussion by default"

    @map.memberships.find_by(user: users(:alice)).update!(chat_access: true)
    subscribe map_id: @map.id
    assert subscription.confirmed?
  end

  test "strangers and unknown maps are rejected" do
    stub_connection current_user: users(:bob)
    subscribe map_id: @map.id
    assert subscription.rejected?
    subscribe map_id: 0
    assert subscription.rejected?
  end

  test "a message of the discussion is announced, never its content; an element's comment is not" do
    stream = MapChatChannel.broadcasting_for(@map)
    comment = Comment.create!(commentable: @map, author: users(:michael), body: "Secret de terrain")
    assert_equal({ "type" => "upsert", "id" => comment.id }, JSON.parse(broadcasts(stream).last))
    comment.soft_delete!
    assert_equal({ "type" => "delete", "id" => comment.id }, JSON.parse(broadcasts(stream).last))

    assert_no_difference -> { broadcasts(stream).size } do
      Comment.create!(commentable: with_feature(@map), author: users(:michael), body: "Noyer")
    end
  end
end

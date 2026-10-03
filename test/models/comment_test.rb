require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class CommentTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @alice = users(:alice) # viewer
    @feature = with_feature(@map)
  end

  test "a comment hangs on the map or on a feature and keeps the map it belongs to" do
    on_map = Comment.create!(commentable: @map, author: @owner, body: "Bonjour")
    on_feature = Comment.create!(commentable: @feature, author: @alice, body: "Beau noyer")
    assert_equal @map, on_map.map
    assert_equal @map, on_feature.map
    assert_equal [ on_feature ], @feature.comments.to_a
    assert_equal 2, @map.discussion_comments.count
  end

  test "a feature of another map is refused" do
    other = Map.create!(name: "Autre", owner: users(:bob), region: regions(:wallonia))
    foreign = with_feature(other)
    comment = Comment.new(commentable: foreign, map: @map, author: @owner, body: "x")
    assert_not comment.valid?
    assert comment.errors.of_kind?(:commentable, :invalid)
  end

  test "body is required, trimmed, bounded and cleaned of control characters" do
    assert_not Comment.new(commentable: @map, author: @owner, body: "   ").valid?
    assert_not Comment.new(commentable: @map, author: @owner, body: "a" * 5001).valid?
    comment = Comment.create!(commentable: @map, author: @owner, body: "  ligne 1\r\nligne\u0000 2  ")
    assert_equal "ligne 1\nligne 2", comment.body
  end

  test "mentions are resolved on the server against the people who can open the map" do
    comment = Comment.create!(commentable: @map, author: @owner, body: "@Alice peux-tu regarder ? cc @Bob")
    assert_equal [ @alice.id ], comment.mentioned_user_ids, "Bob has no access, he cannot be mentioned"
  end

  test "team members can be mentioned too" do
    team = Organization.create!(name: "Semisto")
    team.memberships.create!(user: users(:bob), role: "designer")
    @map.update!(organization: team)
    comment = Comment.create!(commentable: @map, author: @owner, body: "Salut @Bob")
    assert_equal [ users(:bob).id ], comment.mentioned_user_ids
  end

  test "authors and mentioned users are subscribed automatically" do
    Comment.create!(commentable: @feature, author: @owner, body: "Pour @Alice")
    assert CommentSubscription.subscribed?(@owner, @feature)
    assert CommentSubscription.subscribed?(@alice, @feature)
    assert_not CommentSubscription.subscribed?(@alice, @map)
  end

  test "editing sets edited_at, re-resolves mentions and subscribes new ones" do
    comment = Comment.create!(commentable: @feature, author: @owner, body: "Hello")
    assert_not comment.edited?
    comment.update!(body: "Hello @Alice")
    assert comment.edited?
    assert_equal [ @alice.id ], comment.mentioned_user_ids
    assert_equal [ @alice.id ], comment.newly_mentioned_ids
    assert CommentSubscription.subscribed?(@alice, @feature)
  end

  test "soft delete keeps the row and hides it" do
    comment = Comment.create!(commentable: @map, author: @owner, body: "Oups")
    comment.soft_delete!
    assert comment.deleted?
    assert_not_includes Comment.visible, comment
    assert Comment.exists?(comment.id)
  end

  test "applause: one per user per comment" do
    comment = Comment.create!(commentable: @map, author: @owner, body: "Bravo")
    comment.applauses.create!(user: @alice)
    assert_not comment.applauses.build(user: @alice).valid?
    assert_raises(ActiveRecord::RecordNotUnique) do
      Applause.transaction(requires_new: true) { comment.applauses.new(user: @alice).save!(validate: false) }
    end
    comment.applauses.create!(user: @owner)
    assert_equal 2, comment.applauses.count
  end

  test "deleting a feature deletes its discussion" do
    Comment.create!(commentable: @feature, author: @owner, body: "Bye")
    assert_difference -> { Comment.count }, -1 do
      @feature.destroy!
    end
  end

  test "subscription: one per user and thread; subscribe is idempotent" do
    CommentSubscription.subscribe(@alice, @map)
    assert_no_difference -> { CommentSubscription.count } do
      CommentSubscription.subscribe(@alice, @map)
    end
    CommentSubscription.unsubscribe(@alice, @map)
    assert_not CommentSubscription.subscribed?(@alice, @map)
  end

  test "reads: mark! upserts one row per user and thread" do
    CommentRead.mark!(@alice, @map, at: 2.hours.ago)
    CommentRead.mark!(@alice, @map, at: 1.hour.ago)
    assert_equal 1, CommentRead.where(user: @alice).count
    assert_in_delta 1.hour.ago, CommentRead.find_by(user: @alice).last_read_at, 5
  end

  test "Commentable only resolves whitelisted types of the map" do
    assert_equal @feature, Commentable.find_in_map(@map, "MapFeature", @feature.id)
    assert_equal @map, Commentable.find_in_map(@map, "Map", @map.id)
    assert_nil Commentable.find_in_map(@map, "User", @alice.id)
    assert_nil Commentable.find_in_map(@map, "Kernel", 1)
    other = Map.create!(name: "Autre", owner: users(:bob), region: regions(:wallonia))
    assert_nil Commentable.find_in_map(@map, "MapFeature", with_feature(other).id)
    assert_nil Commentable.find_in_map(@map, "Map", other.id)
  end
end

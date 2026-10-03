require "test_helper"
require_relative "../../test_helpers/collab_test_helper"

class Maps::CommentsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @viewer = users(:alice)
    @outsider = users(:bob)
    @feature = with_feature(@map)
  end

  def post_comment(body, on: @feature)
    post map_comments_path(@map), params: { comment: { commentable_type: on.class.name, commentable_id: on.id, body: } }, as: :json
  end

  test "a viewer can comment on a feature and on the map" do
    sign_in_as @viewer
    assert_difference -> { Comment.count }, 2 do
      post_comment "Beau projet"
      assert_response :created
      post_comment "Bravo", on: @map
      assert_response :created
    end
    assert_equal "Alice", json["author"]["name"]
    assert_equal true, json["canEdit"]
    assert_equal [ @viewer.id ], Comment.last.then { |c| [ c.author_id ] }
  end

  test "a non-member cannot read, comment, applaud or follow" do
    comment = Comment.create!(commentable: @feature, author: @owner, body: "Privé")
    sign_in_as @outsider
    get map_comments_path(@map), params: { commentable_type: "MapFeature", commentable_id: @feature.id }, as: :json
    assert_response :not_found
    get threads_map_comments_path(@map), as: :json
    assert_response :not_found
    assert_no_difference -> { Comment.count } do
      post_comment "Intrus"
      assert_response :not_found
    end
    post map_comment_applause_path(@map, comment), as: :json
    assert_response :not_found
    post subscribe_map_comments_path(@map), params: { commentable_type: "Map", commentable_id: @map.id }, as: :json
    assert_response :not_found
    assert_equal 0, comment.applauses.count
  end

  test "signed-out requests are redirected to sign in" do
    get map_comments_path(@map), as: :json
    assert_redirected_to new_session_path
    post map_comments_path(@map), params: { comment: { body: "x" } }, as: :json
    assert_redirected_to new_session_path
  end

  test "a thread belongs to its own map: a feature of another map is a 404" do
    other = Map.create!(name: "Autre", owner: @outsider, region: regions(:wallonia))
    foreign = with_feature(other)
    sign_in_as @owner
    post_comment "x", on: foreign
    assert_response :not_found
    get map_comments_path(@map), params: { commentable_type: "MapFeature", commentable_id: foreign.id }, as: :json
    assert_response :not_found
    post map_comments_path(@map), params: { comment: { commentable_type: "User", commentable_id: @owner.id, body: "x" } }, as: :json
    assert_response :not_found
  end

  test "reading a thread returns comments, mentionable members and marks it read" do
    Comment.create!(commentable: @feature, author: @owner, body: "Premier")
    Comment.create!(commentable: @feature, author: @viewer, body: "Deuxième @Michael")
    Comment.create!(commentable: @feature, author: @owner, body: "Supprimé").soft_delete!
    sign_in_as @viewer
    get map_comments_path(@map), params: { commentable_type: "MapFeature", commentable_id: @feature.id }, as: :json
    assert_response :success
    assert_equal [ "Premier", "Deuxième @Michael" ], json["comments"].map { |c| c["body"] }
    assert_equal "MapFeature:#{@feature.id}", json["commentable"]["key"]
    assert_equal [ "Michael" ], json["members"].map { |m| m["handle"] }, "the current user is not offered as a mention"
    assert_equal [ "Michael" ], json["comments"].last["mentions"].map { |m| m["handle"] }
    assert_nil json["lastReadAt"]
    assert CommentRead.exists?(user: @viewer, commentable: @feature)

    get map_comments_path(@map), params: { commentable_type: "MapFeature", commentable_id: @feature.id }, as: :json
    assert_not_nil json["lastReadAt"]
  end

  test "the thread defaults to the map's own" do
    Comment.create!(commentable: @map, author: @owner, body: "Général")
    sign_in_as @viewer
    get map_comments_path(@map), as: :json
    assert_equal "Map", json["commentable"]["type"]
    assert_equal [ "Général" ], json["comments"].map { |c| c["body"] }
  end

  test "bodies are stored as plain text and returned as is (the client escapes)" do
    sign_in_as @viewer
    post_comment "<img src=x onerror=alert(1)> **gras**"
    assert_response :created
    assert_equal "<img src=x onerror=alert(1)> **gras**", json["body"]
  end

  test "empty and oversized comments are rejected with a message" do
    sign_in_as @viewer
    post_comment "   "
    assert_response :unprocessable_entity
    assert json["message"].present?
    post_comment "a" * 6000
    assert_response :unprocessable_entity
  end

  test "only the author edits; edited_at is set" do
    comment = Comment.create!(commentable: @feature, author: @viewer, body: "Avant")
    sign_in_as @owner
    patch map_comment_path(@map, comment), params: { comment: { body: "Hack" } }, as: :json
    assert_response :forbidden
    assert_equal "Avant", comment.reload.body

    sign_in_as @viewer
    patch map_comment_path(@map, comment), params: { comment: { body: "Après" } }, as: :json
    assert_response :success
    assert_equal "Après", json["body"]
    assert_not_nil json["editedAt"]
  end

  test "the author or the owner deletes (softly); other members cannot" do
    editor = add_member(@map, make_user("Edith"), "editor")
    mine = Comment.create!(commentable: @feature, author: @viewer, body: "A moi")
    sign_in_as editor
    delete map_comment_path(@map, mine), as: :json
    assert_response :forbidden

    sign_in_as @viewer
    delete map_comment_path(@map, mine), as: :json
    assert_response :no_content
    assert mine.reload.deleted?

    theirs = Comment.create!(commentable: @feature, author: @viewer, body: "Modérer")
    sign_in_as @owner
    delete map_comment_path(@map, theirs), as: :json
    assert_response :no_content
    assert theirs.reload.deleted?
    delete map_comment_path(@map, theirs), as: :json
    assert_response :not_found, "already deleted"
  end

  test "mentioning someone subscribes them and queues their e-mail" do
    sign_in_as @owner
    assert_enqueued_with(job: CommentNotificationJob) do
      post_comment "Regarde @Alice"
    end
    assert_equal [ @viewer.id ], Comment.last.mentioned_user_ids
    assert CommentSubscription.subscribed?(@viewer, @feature)
    assert CommentSubscription.subscribed?(@owner, @feature)
  end

  test "applause: one per person, toggled on and off, anyone with access" do
    comment = Comment.create!(commentable: @feature, author: @owner, body: "Bravo")
    sign_in_as @viewer
    post map_comment_applause_path(@map, comment), as: :json
    assert_response :created
    assert_equal({ "count" => 1, "mine" => true, "names" => [ "Alice" ] }, json["applause"])
    post map_comment_applause_path(@map, comment), as: :json
    assert_equal 1, json["applause"]["count"], "a second applause does nothing"
    sign_in_as @owner
    post map_comment_applause_path(@map, comment), as: :json
    assert_equal 2, json["applause"]["count"]
    delete map_comment_applause_path(@map, comment), as: :json
    assert_equal 1, json["applause"]["count"]
    assert_equal false, json["applause"]["mine"]
  end

  test "subscription toggle on a thread" do
    sign_in_as @viewer
    post subscribe_map_comments_path(@map), params: { commentable_type: "MapFeature", commentable_id: @feature.id }, as: :json
    assert_response :created
    assert CommentSubscription.subscribed?(@viewer, @feature)
    get map_comments_path(@map), params: { commentable_type: "MapFeature", commentable_id: @feature.id }, as: :json
    assert_equal true, json["subscribed"]
    delete subscribe_map_comments_path(@map), params: { commentable_type: "MapFeature", commentable_id: @feature.id }, as: :json
    assert_equal false, json["subscribed"]
    assert_not CommentSubscription.subscribed?(@viewer, @feature)
  end

  test "threads: every discussion of the map with count, preview, unread flag" do
    other_feature = with_feature(@map, name: "Pommier")
    Comment.create!(commentable: @feature, author: @owner, body: "Un\nlong commentaire sur le noyer")
    travel 1.minute
    Comment.create!(commentable: @feature, author: @owner, body: "Deux")
    travel 1.minute
    Comment.create!(commentable: other_feature, author: @viewer, body: "Mon pommier")
    sign_in_as @viewer
    get threads_map_comments_path(@map), as: :json
    assert_response :success
    threads = json["threads"]
    assert_equal [ "Pommier", "Noyer", "Domaine d'Ahinvaux" ], threads.map { |t| t["title"] }
    noyer = threads.find { |t| t["title"] == "Noyer" }
    assert_equal 2, noyer["count"]
    assert_equal "Deux", noyer["preview"]
    assert_equal "Michael", noyer["lastAuthorName"]
    assert noyer["unread"], "comments by others I have not opened"
    pommier = threads.find { |t| t["title"] == "Pommier" }
    assert_not pommier["unread"], "my own comment is not unread"
    assert_equal 0, threads.last["count"], "the map's own thread is always listed"

    get map_comments_path(@map), params: { commentable_type: "MapFeature", commentable_id: @feature.id }, as: :json
    get threads_map_comments_path(@map), as: :json
    assert_not json["threads"].find { |t| t["title"] == "Noyer" }["unread"]

    travel 1.minute
    Comment.create!(commentable: @feature, author: @owner, body: "Trois")
    get threads_map_comments_path(@map), as: :json
    assert json["threads"].find { |t| t["title"] == "Noyer" }["unread"], "new comment after I read"
  end

  test "deleted comments do not count in threads" do
    Comment.create!(commentable: @feature, author: @owner, body: "Un").soft_delete!
    sign_in_as @viewer
    get threads_map_comments_path(@map), as: :json
    assert_equal [ "Domaine d'Ahinvaux" ], json["threads"].map { |t| t["title"] }
  end

  test "e-mail preference can be turned off and on" do
    sign_in_as @viewer
    patch comment_preference_path, params: { comment_emails: false }, as: :json
    assert_response :success
    assert_equal false, json["commentEmails"]
    assert_not @viewer.reload.comment_emails
    patch comment_preference_path, params: { comment_emails: true }, as: :json
    assert @viewer.reload.comment_emails
  end
end

require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../test_helpers/collab_test_helper"

# The user's AI reads the map's live discussion, for its members only, with
# what each message points at on the map.
class McpDiscussionTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @pond = with_feature(@map, layer: "notes", kind: "note_point", name: "Mare du bas")
  end

  test "list_discussion reads the messages with cited elements, pinned spot and pages" do
    first = Comment.create!(commentable: @map, author: users(:alice), body: "Bonjour")
    Comment.create!(commentable: @map, author: users(:michael), body: "La #Mare du bas déborde", feature_ids: [ @pond.id ], location: [ 4.91, 50.35 ])
    Comment.create!(commentable: @pond, author: users(:michael), body: "Pas dans la discussion")

    data, error = call_tool(@owner, "list_discussion", { map_id: @map.id, limit: 1 })
    refute error, data
    message = data["messages"].sole
    assert_equal "La #Mare du bas déborde", message["body"]
    assert_equal [ { "id" => @pond.id, "name" => "Mare du bas", "layer" => "notes", "kind" => "note_point" } ], message["features"]
    assert_equal [ 4.91, 50.35 ], message["location"]
    assert message["mine"]
    assert_match "discussion=Map:#{@map.id}", data["url"]

    older, = call_tool(@owner, "list_discussion", { map_id: @map.id, before_id: data["next_before_id"] })
    assert_equal [ first.id ], older["messages"].map { _1["id"] }
    assert_nil older["next_before_id"]

    map, = call_tool(@owner, "get_map", { map_id: @map.id })
    assert_equal({ "member" => true, "messages" => 2, "unread" => 1, "pinned" => 1 }, map["discussion"].except("last_message_at"))
  end

  test "a document joined to a message is listed with it and read by the discussion's members only" do
    doc = @map.all_documents.new(uploaded_by: users(:michael), origin: "chat", in_library: false)
    doc.file.attach(io: StringIO.new("Devis : 120 arbres"), filename: "devis.txt", content_type: "text/plain")
    doc.save!
    Comment.create!(commentable: @map, author: users(:michael), body: "Le devis", map_document: doc)

    data, error = call_tool(@owner, "list_discussion", { map_id: @map.id })
    refute error, data
    assert_equal({ "id" => doc.id, "title" => "devis", "in_library" => false }, data["messages"].sole["document"])
    read, error = call_tool(@owner, "get_document", { map_id: @map.id, document_id: doc.id })
    refute error, read
    assert read["in_discussion_only"]
    listed, = call_tool(@owner, "list_documents", { map_id: @map.id })
    assert_not_includes listed["documents"].map { _1["id"] }, doc.id

    _, error = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: doc.id })
    assert error
  end

  test "a viewer outside the discussion cannot read it" do
    Comment.create!(commentable: @map, author: users(:michael), body: "Entre nous")
    data, error = call_tool(@viewer, "list_discussion", { map_id: @map.id })
    assert error
    assert_match "réservée à ses membres", data.to_s
    map, = call_tool(@viewer, "get_map", { map_id: @map.id })
    assert_equal({ "member" => false }, map["discussion"])
  end
end

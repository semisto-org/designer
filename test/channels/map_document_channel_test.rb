require "test_helper"

class MapDocumentChannelTest < ActionCable::Channel::TestCase
  setup do
    @map = maps(:ahinvaux)
    @doc = MapDocument.build_markdown(map: @map, title: "Journal", content: "# Journal\n", by: users(:michael))
    @doc.save!
    @stream = MapDocumentChannel.broadcasting_for(@doc)
  end

  test "everyone on the map listens; strangers, other files and archived maps are rejected" do
    stub_connection current_user: users(:alice)
    subscribe document_id: @doc.id, client: "a"
    assert subscription.confirmed?
    assert_has_stream_for @doc

    stub_connection current_user: users(:bob)
    subscribe document_id: @doc.id
    assert subscription.rejected?

    pdf = @map.documents.new(uploaded_by: users(:michael))
    pdf.file.attach(io: StringIO.new("%PDF"), filename: "plan.pdf", content_type: "application/pdf")
    pdf.save!
    stub_connection current_user: users(:michael)
    subscribe document_id: pdf.id
    assert subscription.rejected?

    @map.update!(archived_at: Time.current)
    subscribe document_id: @doc.id
    assert subscription.rejected?
  end

  test "an editor's edits are kept and relayed with the tab they came from" do
    stub_connection current_user: users(:michael)
    subscribe document_id: @doc.id, client: "tab1"
    perform :update, update: Base64.strict_encode64("\x01\x02"), epoch: 0
    assert_equal [ "\x01\x02".b ], @doc.collab_updates.pluck(:data)
    message = JSON.parse(broadcasts(@stream).last)
    assert_equal({ "type" => "update", "update" => Base64.strict_encode64("\x01\x02"), "from" => "tab1", "epoch" => 0 }, message)

    perform :awareness, update: "QQ=="
    perform :hello
    assert_equal %w[awareness hello], broadcasts(@stream).last(2).map { JSON.parse(_1)["type"] }
  end

  test "an edit of a text rewritten meanwhile is refused and the tab starts again" do
    @doc.replace_markdown!("Réécrit", by: nil)
    stub_connection current_user: users(:michael)
    subscribe document_id: @doc.id, client: "tab1"
    perform :update, update: Base64.strict_encode64("\x01"), epoch: 0
    assert_empty @doc.collab_updates
    assert_equal({ "type" => "reset", "epoch" => 1 }, transmissions.last)

    perform :update, update: "not base64!", epoch: 1
    assert_equal({ "type" => "error" }, transmissions.last)
  end

  test "readers listen but never write" do
    stub_connection current_user: users(:alice)
    subscribe document_id: @doc.id, client: "r"
    perform :update, update: Base64.strict_encode64("\x01"), epoch: 0
    perform :awareness, update: "QQ=="
    perform :compact, update: "QQ==", last_id: 1, epoch: 0
    assert_empty @doc.collab_updates
    assert_empty broadcasts(@stream)
  end

  test "an editor merges the edits kept so far" do
    first = @doc.add_collab_update!("a", epoch: 0)
    second = @doc.add_collab_update!("b", epoch: 0)
    third = @doc.add_collab_update!("c", epoch: 0)
    stub_connection current_user: users(:michael)
    subscribe document_id: @doc.id
    perform :compact, update: Base64.strict_encode64("ab"), last_id: second.id, epoch: 0
    assert_equal [ [ second.id, "ab" ], [ third.id, "c" ] ], @doc.collab_updates.order(:id).pluck(:id, :data)
    assert_not MapDocumentCollabUpdate.exists?(first.id)
  end
end

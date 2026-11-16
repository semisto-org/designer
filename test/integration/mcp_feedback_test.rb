require "test_helper"
require "test_helpers/mcp_test_helper"

# The user's AI reads « Un retour ? »: one's own feedback, or everyone's for
# Semisto's team, with the annotated screenshot as an image.
class McpFeedbackTest < ActionDispatch::IntegrationTest
  setup do
    @mine = users(:alice).feedbacks.create!(message: "Le bouton est caché", path: "/maps", context: { "viewport" => "390×844" })
    @mine.screenshot.attach(io: file_fixture("plant.png").open, filename: "capture.png", content_type: "image/png")
    @theirs = users(:bob).feedbacks.create!(message: "Bravo")
  end

  test "a person reads only their own feedback" do
    data, error = call_tool(personal_token(users(:alice)), "list_feedback")
    refute error, data
    assert_equal "mine", data["scope"]
    row = data["feedback"].sole
    assert_equal "Le bouton est caché", row["message"]
    assert row["screenshot"]
    assert_equal({ "viewport" => "390×844" }, row["context"])
    assert_nil row["author"]

    _, error = call_tool(personal_token(users(:alice)), "list_feedback", { feedback_id: @theirs.id })
    assert error
  end

  test "Semisto's team reads everyone's, and one feedback comes with its screenshot" do
    admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    token = personal_token(admin)
    data, = call_tool(token, "list_feedback")
    assert_equal "everyone", data["scope"]
    assert_equal [ @theirs.id, @mine.id ], data["feedback"].map { _1["id"] }
    assert_equal users(:bob).display_name, data["feedback"].first.dig("author", "name")

    body = mcp_request(token, "tools/call", { name: "list_feedback", arguments: { feedback_id: @mine.id } })
    content = body.dig("result", "content")
    assert_equal "image", content.last["type"]
    assert_equal "image/jpeg", content.last["mimeType"]
  end

  test "a date that cannot be read is said" do
    text, error = call_tool(personal_token(users(:alice)), "list_feedback", { since: "hier" })
    assert error
    assert_match "hier", text
  end

  test "the status and Semisto's answer are read, and can filter the list" do
    @mine.update!(status: "done", reply: "Corrigé.")
    data, = call_tool(personal_token(users(:alice)), "list_feedback", { status: "done" })
    row = data["feedback"].sole
    assert_equal "done", row["status"]
    assert_equal "Corrigé.", row["reply"]
    data, = call_tool(personal_token(users(:alice)), "list_feedback", { status: "awaiting" })
    assert_empty data["feedback"]
  end
end

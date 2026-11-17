require "test_helper"

class Providers::AnthropicChatTest < ActiveSupport::TestCase
  URL = "https://api.anthropic.com/v1/messages".freeze

  def chat(key = "sk-ant-team-key") = Providers::AnthropicChat.new(api_key: key)

  def create(chat, **overrides)
    chat.create(**{
      model: "claude-opus-5-5", system: "You are Léa.", max_tokens: 1_000, effort: :medium,
      messages: [ { role: "user", content: [ { type: "text", text: "Bonjour" } ] } ],
      tools: [ { name: "get_map", description: "Reads a map", input_schema: { type: "object", properties: { map_id: { type: "integer" } } } } ]
    }.merge(overrides))
  end

  def api_message(content, stop_reason: "end_turn")
    {
      id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content:, stop_reason:, stop_sequence: nil,
      usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 }
    }.to_json
  end

  test "one turn: the team's key, the cached system prompt, the tools, and what came back" do
    stub_request(:post, URL).to_return(
      status: 200, headers: { "Content-Type" => "application/json" },
      body: api_message([
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "Je regarde." },
        { type: "tool_use", id: "toolu_1", name: "get_map", input: { map_id: 7 } }
      ], stop_reason: "tool_use")
    )

    reply = create(chat)

    assert_requested(:post, URL) do |sent|
      body = JSON.parse(sent.body)
      assert_equal "Bearer sk-ant-team-key", sent.headers["Authorization"]
      assert_equal "claude-opus-5-5", body["model"]
      assert_equal [ { "type" => "text", "text" => "You are Léa.", "cache_control" => { "type" => "ephemeral" } } ], body["system"]
      assert_equal({ "effort" => "medium" }, body["output_config"])
      assert_equal({ "type" => "auto" }, body["tool_choice"])
      assert_equal "get_map", body["tools"].first["name"]
      assert_not body.key?("thinking")
    end
    assert_equal "tool_use", reply.stop_reason
    assert_equal "Je regarde.", reply.text
    assert_equal [ { type: "tool_use", id: "toolu_1", name: "get_map", input: { map_id: 7 } } ], reply.tool_uses
    assert_equal({ type: "thinking", thinking: "", signature: "sig" }, reply.content.first)
    assert_equal [ 120, 30, 900, 40 ], [ reply.input_tokens, reply.output_tokens, reply.cache_read_tokens, reply.cache_write_tokens ]
  end

  test "what came back goes out again as it was, on the next turn" do
    stub_request(:post, URL).to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: api_message([ { type: "text", text: "Fini." } ]))
    earlier = [
      { role: "user", content: [ { type: "text", text: "Bonjour" } ] },
      { role: "assistant", content: [ { type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "toolu_1", name: "get_map", input: { map_id: 7 } } ] },
      { role: "user", content: [ { type: "tool_result", tool_use_id: "toolu_1", content: "{}", is_error: false } ] }
    ]
    reply = create(chat, messages: earlier, tool_choice: "none")
    assert_equal "Fini.", reply.text
    assert_requested(:post, URL) do |sent|
      body = JSON.parse(sent.body)
      assert_equal({ "type" => "none" }, body["tool_choice"])
      assert_equal "toolu_1", body["messages"][2]["content"][0]["tool_use_id"]
    end
  end

  test "errors fold into a refused key, a provider that cannot answer, a rejected request" do
    error = ->(type) { { type: "error", error: { type:, message: "nope" } }.to_json }
    json = { "Content-Type" => "application/json" }

    stub_request(:post, URL).to_return(status: 401, headers: json, body: error.call("authentication_error"))
    assert_raises(Providers::AnthropicChat::Unauthorized) { create(chat) }

    stub_request(:post, URL).to_return(status: 400, headers: json, body: error.call("invalid_request_error"))
    assert_raises(Providers::AnthropicChat::Rejected) { create(chat) }

    stub_request(:post, URL).to_return(status: 529, headers: json.merge("x-should-retry" => "false"), body: error.call("overloaded_error"))
    assert_raises(Providers::AnthropicChat::Unavailable) { create(chat) }

    assert_raises(Providers::AnthropicChat::Unauthorized) { create(chat("")) }
  end
end

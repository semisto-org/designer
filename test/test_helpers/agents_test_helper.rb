require_relative "teams_test_helper"

# Helpers for the « Collègue IA » tests: a team with its colleague ready, a
# team map where she is switched on, and a scripted model.
module AgentsTestHelper
  def make_colleague(team, name: "Léa", key: "sk-ant-test-0123456789", **attributes)
    team.update!(agents_module_granted_at: Time.current, agent_api_key: key)
    team.create_team_agent!(name:, **attributes)
  end

  # A map of the team, with the colleague switched on.
  def colleague_map(team, owner:, name: "Verger du pilote", enabled: true)
    map = Map.create!(name:, owner:, region: regions(:wallonia), organization: team)
    map.update!(agent_enabled_at: Time.current, agent_enabled_by: owner) if enabled
    map
  end

  # Plays the model: answers each turn with the next scripted reply, and
  # keeps what it was sent.
  class ScriptedChat
    attr_reader :calls

    def initialize(*replies)
      @replies = replies
      @calls = []
    end

    def create(**params)
      @calls << params.merge(messages: params[:messages].deep_dup)
      reply = @replies.shift or raise "the script has no reply left"
      reply.respond_to?(:call) ? reply.call : reply
    end
  end

  def model_says(text, stop_reason: "end_turn", **usage)
    reply([ { type: "text", text: } ], stop_reason, **usage)
  end

  def model_calls(name, input, id: "toolu_#{SecureRandom.hex(4)}", **usage)
    reply([ { type: "tool_use", id:, name:, input: } ], "tool_use", **usage)
  end

  def reply(content, stop_reason, input: 1_000, output: 200, cache_read: 0, cache_write: 0)
    Providers::AnthropicChat::Reply.new(content:, stop_reason:, input_tokens: input, output_tokens: output, cache_read_tokens: cache_read, cache_write_tokens: cache_write)
  end
end

ActiveSupport::TestCase.include AgentsTestHelper
ActionDispatch::IntegrationTest.include AgentsTestHelper

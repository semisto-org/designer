module Providers
  # Claude, through Anthropic's official SDK, with the key of the team whose
  # colleague is working (Organization#agent_api_key): Semisto holds no key
  # of its own. One call = one turn of the conversation; the loop, the tools
  # and the budget live in Agents::Runner.
  #
  # Errors are folded into three kinds the colleague can explain in clear:
  # the key is refused (Unauthorized), the provider cannot answer now
  # (Unavailable), the request itself was refused (Rejected).
  class AnthropicChat
    class Error < StandardError; end
    class Unauthorized < Error; end
    class Unavailable < Error; end
    class Rejected < Error; end

    TIMEOUT = 180
    # Named here so that nothing in the server's environment (the SDK reads
    # ANTHROPIC_BASE_URL) can send a team's key elsewhere.
    BASE_URL = "https://api.anthropic.com".freeze

    Reply = Data.define(:content, :stop_reason, :input_tokens, :output_tokens, :cache_read_tokens, :cache_write_tokens) do
      def text = content.select { _1[:type] == "text" }.map { _1[:text] }.join("\n").strip
      def tool_uses = content.select { _1[:type] == "tool_use" }
    end

    def initialize(api_key:)
      @api_key = api_key.to_s
    end

    def configured? = @api_key.present?

    # `system`: text; `messages`, `tools`: as the Messages API takes them.
    def create(model:, system:, messages:, tools:, max_tokens:, effort:, tool_choice: "auto")
      raise Unauthorized, "no key" unless configured?
      params = {
        model:, max_tokens:, messages:,
        system_: [ { type: "text", text: system, cache_control: { type: "ephemeral" } } ],
        output_config: { effort: }
      }
      # On her last turn the tools stay declared (earlier turns used them)
      # but she may only write.
      params.merge!(tools:, tool_choice: { type: tool_choice }) if tools.present?
      reply(client.messages.create(**params))
    rescue ::Anthropic::Errors::AuthenticationError, ::Anthropic::Errors::PermissionDeniedError => e
      raise Unauthorized, e.message
    rescue ::Anthropic::Errors::BadRequestError, ::Anthropic::Errors::NotFoundError, ::Anthropic::Errors::UnprocessableEntityError, ::Anthropic::Errors::ContentTooLargeError => e
      raise Rejected, e.message
    rescue ::Anthropic::Errors::APIError => e
      raise Unavailable, e.message
    end

    private
      def client
        @client ||= ::Anthropic::Client.new(api_key: @api_key, base_url: BASE_URL, timeout: TIMEOUT, max_retries: 2)
      end

      def reply(message)
        usage = message.usage
        Reply.new(
          content: message.content.filter_map { |block| block_hash(block) },
          stop_reason: message.stop_reason.to_s,
          input_tokens: usage.input_tokens.to_i, output_tokens: usage.output_tokens.to_i,
          cache_read_tokens: usage.cache_read_input_tokens.to_i, cache_write_tokens: usage.cache_creation_input_tokens.to_i
        )
      end

      # Blocks go back to the API as they came (a thinking block with its
      # signature), so the next turn can follow this one.
      def block_hash(block)
        case block.type.to_s
        when "text" then { type: "text", text: block.text }
        when "thinking" then { type: "thinking", thinking: block.thinking, signature: block.signature }
        when "redacted_thinking" then { type: "redacted_thinking", data: block.data }
        when "tool_use" then { type: "tool_use", id: block.id, name: block.name, input: (block.input || {}).to_h.deep_symbolize_keys }
        end
      end
  end
end

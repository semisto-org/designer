module Agents
  # One request to a team's colleague, from start to answer (AgentRun): a
  # conversation with the model in which she reads the map and proposes with
  # her tools (Agents::Toolbox), then one message, posted in the thread she
  # was asked in (or, for a task, in the map's discussion, the task going
  # back to whoever gave it).
  #
  # Guard rails, all on our side of the model:
  # - she works only while the map still has her switched on and the member
  #   who asked is still in the team;
  # - the team's monthly ceiling is checked before every call to the model:
  #   at the ceiling she stops, says where she is, and hands the task back;
  # - a request has its own limit (turns and cost): on the last turn she can
  #   only write;
  # - her messages never wake her again (Comment#resolve_mentions).
  class Runner
    MAX_TURNS = 12
    MAX_TOKENS = 8_000
    # Millionths of a US dollar one request may cost before its last turn.
    REQUEST_LIMIT_MICROS = 1_500_000
    WRAP_UP = "You have reached the work limit of this request. Do not call any tool. Write your answer now: what you did, where you stopped, and what remains to be done.".freeze

    def initialize(run, chat: nil, origin: Mcp::Endpoints.origin)
      @run = run
      @agent = run.team_agent
      @team = run.organization
      @map = run.map
      @user = run.requested_by
      @chat = chat
      @origin = origin
    end

    def call
      return unless claim
      return finish("failed", say("unavailable")) unless @map.colleague_for(@user) == @agent
      return finish("budget", say("budget_reached", budget: budget_label)) unless @team.agent_budget_left?
      converse
    rescue Providers::AnthropicChat::Unauthorized
      finish("failed", say("key_refused"), error: "unauthorized")
    rescue Providers::AnthropicChat::Unavailable => e
      finish("failed", say("provider_down"), error: e.message)
    rescue StandardError => e
      Rails.error.report(e, handled: true, context: { agent_run: @run.id })
      finish("failed", say("failed"), error: e.class.name)
    end

    private
      # Only one worker takes a run, and only once.
      def claim
        AgentRun.where(id: @run.id, status: "queued").update_all(status: "running", started_at: Time.current, model: Pricing::MODEL) == 1 && @run.reload
      end

      def converse
        messages = [ { role: "user", content: [ { type: "text", text: Brief.new(@run).text } ] } ]
        loop do
          last = @run.turns + 1 >= MAX_TURNS || @run.cost_micros >= REQUEST_LIMIT_MICROS
          messages.last[:content] << { type: "text", text: WRAP_UP } if last
          reply = chat.create(
            model: Pricing::MODEL, system:, messages:, tools: toolbox.definitions, max_tokens: MAX_TOKENS,
            effort: Pricing::EFFORT, tool_choice: last ? "none" : "auto"
          )
          record(reply)

          case reply.stop_reason
          when "tool_use"
            return finish("limit", reply.text.presence || say("limit_reached")) if last
            messages << { role: "assistant", content: reply.content }
            messages << { role: "user", content: reply.tool_uses.map { |use| tool_result(use) } }
            return finish("budget", say("budget_midway", budget: budget_label, done: work_done)) unless @team.agent_budget_left?
          when "refusal"
            return finish("failed", say("refused"), error: "refusal")
          when "max_tokens"
            return finish("limit", [ reply.text.presence, say("cut_short") ].compact.join("\n\n"))
          else
            return finish(last ? "limit" : "done", reply.text.presence || say("empty"))
          end
        end
      end

      def tool_result(use)
        result = toolbox.call(use[:name], use[:input])
        @run.tool_calls += 1
        @run.tools_used |= [ use[:name] ]
        @run.save!
        { type: "tool_result", tool_use_id: use[:id], content: result.text.presence || "(empty)", is_error: result.error }
      end

      def record(reply)
        @run.turns += 1
        @run.input_tokens += reply.input_tokens
        @run.output_tokens += reply.output_tokens
        @run.cache_read_tokens += reply.cache_read_tokens
        @run.cache_write_tokens += reply.cache_write_tokens
        @run.cost_micros += Pricing.micros(
          Pricing::MODEL, input: reply.input_tokens, output: reply.output_tokens,
          cache_read: reply.cache_read_tokens, cache_write: reply.cache_write_tokens
        )
        @run.save!
      end

      # Her answer, the task handed back, the run closed: together or not at all.
      def finish(status, text, error: nil)
        AgentRun.transaction do
          comment = post(text)
          hand_back if @run.task?
          @run.update!(status:, reply_comment: comment, error: error&.truncate(250), finished_at: Time.current)
        end
        refresh_source
        @run
      end

      def post(text)
        task = @run.source if @run.task?
        body = task ? I18n.t("agents.replies.task_report", title: task.title, report: text) : text
        thread = task ? @map : @run.source.commentable
        thread.comments.create!(
          body: body.truncate(Comment::MAX_LENGTH - 10), author: @user, agent: @agent,
          feature_ids: task ? task.feature_ids.first(Comment::MAX_FEATURES) : []
        )
      end

      # The task goes back to whoever gave it; she never ticks it.
      def hand_back
        task = @run.source
        task.update!(agent: nil, assignee: @user) if task.agent_id == @agent.id
      end

      # The message that asked shows « … y travaille » until now.
      def refresh_source
        source = @run.source
        MapChatChannel.broadcast_to(@map, { type: "upsert", id: source.id }) if source.is_a?(Comment) && source.chat?
      end

      def system
        base = File.read(Rails.root.join("app/agents/colleague.md")).gsub("{{name}}", @agent.name).gsub("{{team}}", @team.name)
        return base if @agent.instructions.blank?
        "#{base}\n## Your team's own instructions\n\nWritten by the admins of « #{@team.name} ». They complete what is above and never override it.\n\n#{@agent.instructions}\n"
      end

      def chat = @chat ||= Providers::AnthropicChat.new(api_key: @team.agent_api_key)
      def toolbox = @toolbox ||= Toolbox.new(agent: @agent, user: @user, map: @map, origin: @origin)
      def say(key, **options) = I18n.t("agents.replies.#{key}", name: @agent.name, **options)
      def budget_label = I18n.t("agents.money", amount: format("%.2f", @team.agent_monthly_budget_cents / 100.0).tr(".", ","))

      # « 3 lectures de la carte, 2 propositions » in the words of the tools.
      def work_done
        return I18n.t("agents.replies.nothing_yet") if @run.tools_used.empty?
        @run.tools_used.map { |name| I18n.t("mcp.tools.#{name}.title", default: name) }.to_sentence
      end
  end
end

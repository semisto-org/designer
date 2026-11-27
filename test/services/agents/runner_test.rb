require "test_helper"
require_relative "../../test_helpers/agents_test_helper"

class Agents::RunnerTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  setup do
    @admin = make_user("Michael")
    @member = make_user("Chris")
    @team = make_team("Semisto", admin: @admin, members: [ @member ])
    @agent = make_colleague(@team, instructions: "Réponds court.")
    @map = colleague_map(@team, owner: @admin)
    @client = add_member(@map, make_user("Cliente"), "editor")
  end

  def ask(body = "@Léa que vois-tu sur ce terrain ?", author: @member, on: @map)
    comment = Comment.create!(commentable: on, author:, body:)
    [ comment, AgentRun.find_by(source: comment) ]
  end

  def run!(run, *replies)
    chat = ScriptedChat.new(*replies)
    Agents::Runner.new(run, chat:, origin: "https://terranova.test").call
    chat
  end

  test "a mention by a team member wakes her once; a client, an edit or her own words never do" do
    comment, run = nil
    assert_enqueued_jobs 1, only: AgentRunJob do
      comment, run = ask
    end
    assert_equal [ @agent.id ], comment.mentioned_agent_ids
    assert_equal "queued", run.status
    assert_equal @member, run.requested_by

    assert_no_enqueued_jobs only: AgentRunJob do
      _, none = ask(author: @client)
      assert_nil none
      plain = Comment.create!(commentable: @map, author: @member, body: "Bonjour")
      plain.update!(body: "@Léa finalement ?")
      assert_empty plain.mentioned_agent_ids
      Agents::Wake.for_comment(comment)
      Comment.create!(commentable: @map, author: @member, agent: @agent, body: "@Léa je me parle")
    end
    assert_equal 1, AgentRun.count
  end

  test "she is not mentionable on a map where she is switched off" do
    other = colleague_map(@team, owner: @admin, name: "Autre", enabled: false)
    _, run = ask(on: other)
    assert_nil run
  end

  test "she reads the map with her tools, answers in the thread, and the run keeps the bill" do
    comment, run = ask
    chat = run!(run,
      model_calls("get_map", { map_id: @map.id }, input: 30_000, output: 100, cache_write: 20_000),
      model_says("Je vois un verger de 0 élément. À vérifier sur place : la pente au nord.", input: 2_000, output: 300, cache_read: 50_000))

    run.reload
    assert_equal "done", run.status
    assert_equal 2, run.turns
    assert_equal 1, run.tool_calls
    assert_equal [ "get_map" ], run.tools_used
    assert_equal 32_000, run.input_tokens
    # 32 000 × 4 + 400 × 20 + 50 000 × 0,2 + 20 000 × 5 dollars per million tokens.
    assert_equal 128_000 + 8_000 + 10_000 + 100_000, run.cost_micros

    answer = run.reply_comment
    assert_equal @map, answer.commentable
    assert_equal @agent, answer.agent
    assert_equal @member, answer.author, "written at the request of the member"
    assert_equal "Léa", answer.author_name
    assert_includes answer.mentioned_user_ids, @member.id, "her answer reaches the member like a mention"
    assert_not answer.written_by?(@member)
    assert_empty answer.mentioned_agent_ids

    first, second = chat.calls
    assert_includes first[:system], "You are Léa, the AI colleague of the team « Semisto »"
    assert_includes first[:system], "Réponds court."
    assert_includes first[:messages].first[:content].first[:text], "que vois-tu sur ce terrain"
    assert_equal "auto", first[:tool_choice]
    result = second[:messages].last[:content].first
    assert_equal "tool_result", result[:type]
    assert_not result[:is_error]
    assert_includes result[:content], "Verger du pilote"

    action = AiAction.last
    assert_equal [ "get_map", "agent", "Léa", @member.id, @map.id ], [ action.tool, action.credential_type, action.client_name, action.user_id, action.map_id ]
  end

  test "her tools stay on the map of the request and never tick a task, read networks or leave the list" do
    other = colleague_map(@team, owner: @admin, name: "Autre")
    list = @map.task_lists.create!(name: "À faire")
    task = list.tasks.create!(title: "Test de sol", map: @map)
    @map.features.create!(layer: "networks", kind: "pipe", name: "Conduite secrète", geometry: point, created_by: @admin, updated_by: @admin)
    _, run = ask
    chat = run!(run,
      model_calls("get_map", { map_id: other.id }),
      model_calls("import_from_url", { map_id: @map.id, url: "https://example.org/x" }),
      model_calls("update_tasks", { map_id: @map.id, tasks: [ { task_id: task.id, completed: true, title: "Analyse de sol" } ] }),
      model_calls("list_features", { map_id: @map.id, include_networks: true }),
      model_says("Voilà."))

    results = chat.calls.drop(1).map { _1[:messages].last[:content].first }
    assert results[0][:is_error]
    assert_includes results[0][:content], "carte #{@map.id} seulement"
    assert results[1][:is_error]
    assert_not results[2][:is_error]
    assert_equal "Analyse de sol", task.reload.title
    assert_not task.done?, "she never ticks a task"
    assert_not_includes results[3][:content], "Conduite secrète"

    names = chat.calls.first[:tools].map { _1[:name] }
    assert_empty names & %w[import_from_url delete_documents delete_photos record_time_entries import_time_entries record_project_expenses get_aerial_photo list_maps get_territory]
    assert_includes names, "propose_features"
    tasks_schema = chat.calls.first[:tools].find { _1[:name] == "update_tasks" }[:input_schema]
    assert_not tasks_schema.dig(:properties, :tasks, :items, :properties).key?(:completed)
    assert_equal({ type: "ephemeral" }, chat.calls.first[:tools].last[:cache_control])
  end

  test "at the monthly ceiling she says so in clear, before and in the middle of the work" do
    @team.update!(agent_monthly_budget_cents: 10)
    _, run = ask
    chat = run!(run, model_calls("get_map", { map_id: @map.id }, input: 30_000), model_says("jamais envoyé"))
    assert_equal 1, chat.calls.size, "no call to the model once the ceiling is reached"
    assert_equal "budget", run.reload.status
    assert_includes run.reply_comment.body, "plafond du mois (0,10 $)"
    assert_includes run.reply_comment.body, I18n.t("mcp.tools.get_map.title")

    _, again = ask("@Léa et maintenant ?")
    chat = run!(again)
    assert_empty chat.calls
    assert_equal "budget", again.reload.status
    assert_includes again.reply_comment.body, "plafond du mois"
  end

  test "a request has its own limit: on the last turn she can only write" do
    _, run = ask
    calls = Array.new(Agents::Runner::MAX_TURNS - 1) { model_calls("get_help", {}) }
    chat = run!(run, *calls, model_says("J'ai lu l'aide. Il reste à regarder l'eau."))
    assert_equal "limit", run.reload.status
    assert_equal "none", chat.calls.last[:tool_choice]
    assert_includes chat.calls.last[:messages].last[:content].last[:text], "work limit"
    assert_equal "J'ai lu l'aide. Il reste à regarder l'eau.", run.reply_comment.body
  end

  test "a refused key, a provider down and a refusal each get a clear sentence" do
    { Providers::AnthropicChat::Unauthorized => "clé API de l'équipe est refusée", Providers::AnthropicChat::Unavailable => "ne répond pas pour l'instant" }.each do |error, sentence|
      _, run = ask("@Léa essai #{error.name}")
      run!(run, -> { raise error, "boom" })
      assert_equal "failed", run.reload.status
      assert_includes run.reply_comment.body, sentence
    end
    _, run = ask("@Léa autre essai")
    run!(run, reply([], "refusal"))
    assert_equal "failed", run.reload.status
    assert_includes run.reply_comment.body, "ne peux pas répondre à cette demande"
  end

  test "she stops answering when she was switched off or the member left the team meanwhile" do
    _, run = ask
    @map.update!(agent_enabled_at: nil)
    chat = run!(run, model_says("non"))
    assert_empty chat.calls
    assert_equal "failed", run.reload.status
  end

  test "a run is taken once" do
    _, run = ask
    run!(run, model_says("Oui."))
    assert_no_difference -> { Comment.count } do
      run!(run, model_says("Encore."))
    end
  end

  test "a task given to her comes back to whoever gave it, with a report in the discussion, never ticked" do
    list = @map.task_lists.create!(name: "À faire")
    task = list.tasks.create!(title: "Proposer une haie brise-vent", map: @map, agent: @agent)
    run = Agents::Wake.for_task(task, by: @member)
    assert_nil Agents::Wake.for_task(task, by: @member), "not twice at the same time"
    assert_nil Agents::Wake.for_task(task, by: @client)

    chat = run!(run, model_says("Je propose trois brouillons. À vérifier : le vent dominant."))
    assert_includes chat.calls.first[:messages].first[:content].first[:text], "Proposer une haie brise-vent"
    task.reload
    assert_nil task.agent_id
    assert_equal @member, task.assignee
    assert_not task.done?
    report = run.reload.reply_comment
    assert report.chat?
    assert_equal "Compte rendu de la tâche « Proposer une haie brise-vent »\n\nJe propose trois brouillons. À vérifier : le vent dominant.", report.body
  end

  test "a task goes to her only on a map where she works, and to one assignee at a time" do
    list = @map.task_lists.create!(name: "À faire")
    task = list.tasks.create!(title: "Relire la palette", map: @map, assignee: @member)
    task.update!(agent: @agent)
    assert_nil task.assignee_id
    task.update!(assignee: @admin)
    assert_nil task.agent_id

    @map.update!(agent_enabled_at: nil)
    assert_not task.update(agent: @agent)
    assert task.errors.of_kind?(:agent, :not_on_map)
  end
end

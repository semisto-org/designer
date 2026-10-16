require "test_helper"
require "test_helpers/mcp_test_helper"

# The user's AI reads and keeps the project's tasks and its library of
# documents, with the user's role on the map.
class McpTasksDocumentsTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @stranger = personal_token(users(:bob))
  end

  def create_document(file, type, filename: file, **attrs)
    doc = @map.documents.new(uploaded_by: users(:michael), **attrs)
    doc.file.attach(io: file.is_a?(String) ? file_fixture(file).open : file, filename:, content_type: type)
    doc.save!
    doc
  end

  test "list_tasks gives Semisto's default lists on the first read, with who can be given a task" do
    data, error = call_tool(@viewer, "list_tasks", { map_id: @map.id })
    refute error
    assert_equal 4, data["lists"].size
    assert data["lists"].all? { _1["default"] }
    assert_equal @map.tasks.count, data["count"]
    assert data["tasks"].any? { _1["semisto_default"] && _1.key?("map_says_done") }
    assert_equal %w[Alice Michael], data["participants"].map { _1["name"] }.sort
    refute data.dig("can", "manage"), "a viewer manages nothing"
    assert data.dig("can", "tick_own_tasks")
    assert_equal({ "tasks" => data["count"] }, AiAction.last.result)

    _, error = call_tool(@stranger, "list_tasks", { map_id: @map.id })
    assert error
  end

  test "list_tasks filters by status, person and tag" do
    TaskList::Defaults.seed!(@map)
    task = @map.tasks.first
    task.update!(assignee: users(:alice), tags: [ "Chantier" ], due_on: Date.current - 1)
    data, = call_tool(@viewer, "list_tasks", { map_id: @map.id, assignee: "me" })
    assert_equal [ task.id ], data["tasks"].map { _1["id"] }
    assert data["tasks"].sole["overdue"]
    data, = call_tool(@viewer, "list_tasks", { map_id: @map.id, tag: "chantier" })
    assert_equal [ task.id ], data["tasks"].map { _1["id"] }
    assert_equal({ "Chantier" => 1 }, data["tags"])
    task.update!(completed: true)
    data, = call_tool(@viewer, "list_tasks", { map_id: @map.id, status: "done" })
    assert_equal [ task.id ], data["tasks"].map { _1["id"] }
  end

  test "create_tasks writes tasks in a list found or made by name, and e-mails the person given one" do
    TaskList::Defaults.seed!(@map)
    first = @map.task_lists.first
    data = nil
    assert_enqueued_emails 1 do
      data, error = call_tool(@owner, "create_tasks", { map_id: @map.id, tasks: [
        { list_id: first.id, title: "Faire un test de sol", due_on: "2026-11-15", assignee_id: users(:alice).id, tags: [ "sol" ] },
        { list_name: "Chantier de mars", title: "Commander les plants", notes: "Chez la pépinière de Semisto." },
        { list_name: "chantier de MARS", title: "Prévoir le paillage" },
        { title: "Sans liste" },
        { list_id: first.id, title: "Mauvaise date", due_on: "15/11/2026" },
        { list_id: first.id, title: "À un inconnu", assignee_id: users(:bob).id }
      ] })
      refute error
    end
    assert_equal 3, data["created"].size
    soil = data["created"].first
    assert_equal [ "Faire un test de sol", "2026-11-15", "Alice", [ "sol" ] ], soil.values_at("title", "due_on").push(soil.dig("assignee", "name"), soil["tags"])
    march = @map.task_lists.find_by!(name: "Chantier de mars")
    assert_equal [ "Commander les plants", "Prévoir le paillage" ], march.tasks.map(&:title)
    assert_equal users(:michael), march.tasks.first.created_by
    assert_equal [ 3, 4, 5 ], data["rejected"].map { _1["index"] }
    assert_match(/list_name/, data["rejected"][0]["error"])
    assert_match(/AAAA-MM-JJ/, data["rejected"][1]["error"])
    assert_match(/participer/, data["rejected"][2]["error"])
    assert_equal({ "created" => 3, "rejected" => 3 }, AiAction.last.result)
  end

  test "writing tasks needs the drafts access, an editor and the owner's plan" do
    TaskList::Defaults.seed!(@map)
    line = { list_id: @map.task_lists.first.id, title: "Tailler la haie" }
    text, error = call_tool(@viewer, "create_tasks", { map_id: @map.id, tasks: [ line ] })
    assert error
    assert_match(/éditeurs/, text)

    read_only = personal_token(users(:michael), access: "read")
    text, error = call_tool(read_only, "create_tasks", { map_id: @map.id, tasks: [ line ] })
    assert error
    assert_match(/lecture/, text)

    with_billing do
      text, error = call_tool(@owner, "create_tasks", { map_id: @map.id, tasks: [ line ] })
      assert error
      assert_match(/forfait/, text)
    end
    refute @map.tasks.exists?(title: "Tailler la haie")
  end

  test "the AI gives tasks to someone invited who has not joined yet" do
    @map.invitations.create!(email_address: "dana@example.org", role: "editor", invited_by: users(:michael))
    data, error = call_tool(@owner, "list_tasks", { map_id: @map.id })
    refute error
    assert_includes data["participants"], { "email" => "dana@example.org", "name" => "dana@example.org", "role" => "invited" }

    data = nil
    assert_enqueued_emails 1 do
      data, error = call_tool(@owner, "create_tasks", { map_id: @map.id, tasks: [ { list_name: "Chantier", title: "Relever les arbres", assignee_email: "dana@example.org" } ] })
      refute error
    end
    created = data["created"].sole
    assert_equal({ "email" => "dana@example.org", "invited" => true }, created["assignee"])

    _, error = call_tool(@owner, "update_tasks", { map_id: @map.id, tasks: [ { task_id: created["id"], assignee_id: nil } ] })
    refute error
    refute Task.find(created["id"]).assigned?

    _, error = call_tool(@owner, "update_tasks", { map_id: @map.id, tasks: [ { task_id: created["id"], assignee_email: "stranger@example.org" } ] })
    assert error
  end

  test "update_tasks ticks, moves, dates and gives tasks; a viewer only ticks their own" do
    TaskList::Defaults.seed!(@map)
    first, second = @map.task_lists.first(2)
    task, other = first.tasks.first(2)
    data = nil
    assert_enqueued_emails 1 do
      data, error = call_tool(@owner, "update_tasks", { map_id: @map.id, tasks: [
        { task_id: task.id, completed: true, list_id: second.id, due_on: "2026-12-01", assignee_id: users(:alice).id, tags: [ "hiver" ] },
        { task_id: 999_999, completed: true }
      ] })
      refute error
    end
    task.reload
    assert task.done?
    assert_equal users(:michael), task.completed_by
    assert_equal [ second, Date.new(2026, 12, 1), users(:alice), [ "hiver" ] ], [ task.task_list, task.due_on, task.assignee, task.tags ]
    assert_equal second.tasks.last, task
    assert_match(/introuvable/, data["rejected"].sole["error"])

    _, error = call_tool(@owner, "update_tasks", { map_id: @map.id, tasks: [ { task_id: task.id, due_on: nil, assignee_id: nil, completed: false } ] })
    refute error
    task.reload
    assert_nil task.due_on
    assert_nil task.assignee
    refute task.done?

    task.update!(assignee: users(:alice))
    data, error = call_tool(@viewer, "update_tasks", { map_id: @map.id, tasks: [
      { task_id: task.id, completed: true },
      { task_id: task.id, title: "Autre chose" },
      { task_id: other.id, completed: true }
    ] })
    refute error
    assert task.reload.done?
    assert_equal users(:alice), task.completed_by
    assert_equal 2, data["rejected"].size
    refute other.reload.done?
  end

  test "get_map counts the tasks and documents, and says whether the AI may write them" do
    TaskList::Defaults.seed!(@map)
    data, = call_tool(@owner, "get_map", { map_id: @map.id })
    assert_equal @map.tasks.count, data.dig("tasks", "pending")
    assert_equal 0, data["documents"]
    assert data.dig("permissions", "write_tasks_documents_photos")
    data, = call_tool(@viewer, "get_map", { map_id: @map.id })
    refute data.dig("permissions", "write_tasks_documents_photos")
  end

  test "list_documents and get_document read the text of a PDF" do
    pdf = create_document("analyse_sol.pdf", "application/pdf", title: "Analyse de sol", tags: [ "Sol" ])
    create_document("drone_dji.jpg", "image/jpeg", title: "Vue du drone")
    data, error = call_tool(@viewer, "list_documents", { map_id: @map.id })
    refute error
    assert_equal [ "Vue du drone", "Analyse de sol" ], data["documents"].map { _1["title"] }
    assert data["documents"].all? { _1["readable"] }
    refute data.dig("can", "add_and_edit")
    data, = call_tool(@viewer, "list_documents", { map_id: @map.id, kind: "pdf" })
    assert_equal [ pdf.id ], data["documents"].map { _1["id"] }
    data, = call_tool(@viewer, "list_documents", { map_id: @map.id, tag: "sol" })
    assert_equal [ pdf.id ], data["documents"].map { _1["id"] }

    data, error = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: pdf.id })
    refute error
    assert_equal [ "text", 1 ], data.values_at("format", "pages")
    assert_match(/pH eau : 6\.4/, data["text"])
    assert_nil data["next_offset"]
    assert_equal({ "document_id" => pdf.id, "format" => "text" }, AiAction.last.result)

    _, error = call_tool(@stranger, "get_document", { map_id: @map.id, document_id: pdf.id })
    assert error
  end

  test "get_document gives an image to look at, pages long texts, and says why a file cannot be read" do
    photo = create_document("drone_dji.jpg", "image/jpeg")
    body = mcp_request(@viewer, "tools/call", { name: "get_document", arguments: { map_id: @map.id, document_id: photo.id } })
    image = body.dig("result", "content").find { _1["type"] == "image" }
    assert_equal "image/jpeg", image["mimeType"]
    assert_equal "image", body.dig("result", "structuredContent", "format")

    long = create_document(StringIO.new("é" * (Mcp::Tools::GetDocument::MAX_CHARS + 10)), "text/plain", filename: "long.txt")
    data, = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: long.id })
    assert_equal Mcp::Tools::GetDocument::MAX_CHARS, data["text"].size
    assert_equal Mcp::Tools::GetDocument::MAX_CHARS, data["next_offset"]
    data, = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: long.id, offset: data["next_offset"] })
    assert_equal "é" * 10, data["text"]

    latin1 = create_document(StringIO.new("espèce;quantité\n".encode("Windows-1252")), "text/csv", filename: "plants.csv")
    data, = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: latin1.id })
    assert_equal "espèce;quantité\n", data["text"]

    sheet = create_document(StringIO.new("PK"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "budget.xlsx")
    data, error = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: sheet.id })
    refute error
    assert_equal "unreadable", data["format"]
    assert_match(/bibliothèque/, data["reason"])
    refute data.key?("text")
  end

  test "get_document reads a Word file" do
    buffer = Zip::OutputStream.write_buffer do |zip|
      zip.put_next_entry("word/document.xml")
      zip.write(<<~XML)
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
          <w:p><w:r><w:t>Compte rendu de visite</w:t></w:r></w:p>
          <w:p><w:r><w:t>Le sol est </w:t></w:r><w:r><w:t>argileux.</w:t></w:r></w:p>
        </w:body></w:document>
      XML
    end
    buffer.rewind
    doc = create_document(buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", filename: "visite.docx")
    data, = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: doc.id })
    assert_equal "Compte rendu de visite\nLe sol est argileux.", data["text"]
  end

  test "add_document files the AI's own document, and update_document renames and retags one" do
    data, error = call_tool(@owner, "add_document", {
      map_id: @map.id, title: "Compte rendu de la visite du 11 octobre", content: "# Visite\n\nLe sol est frais.",
      description: "Ce que nous avons vu sur le terrain.", tags: [ "Visites" ]
    })
    refute error
    doc = @map.documents.find(data["id"])
    assert_equal [ "compte-rendu-de-la-visite-du-11-octobre.md", "text/markdown" ], [ doc.file.filename.to_s, doc.file.content_type ]
    assert_equal "# Visite\n\nLe sol est frais.", doc.file.download
    assert_equal [ users(:michael), "library", [ "Visites" ] ], [ doc.uploaded_by, doc.origin, doc.tags ]
    assert_equal 27, AiAction.last.arguments["content_chars"], "the content is not copied into the journal"

    data, error = call_tool(@owner, "update_document", { map_id: @map.id, document_id: doc.id, title: "Visite d'octobre", description: nil, tags: [ "Visites", "2026" ] })
    refute error
    doc.reload
    assert_equal [ "Visite d'octobre", nil, [ "Visites", "2026" ] ], [ doc.title, doc.description, doc.tags ]
    assert_equal "# Visite\n\nLe sol est frais.", doc.file.download, "the file never changes"

    text, error = call_tool(@viewer, "add_document", { map_id: @map.id, title: "Note", content: "Bonjour" })
    assert error
    assert_match(/éditeurs/, text)
    _, error = call_tool(@viewer, "update_document", { map_id: @map.id, document_id: doc.id, title: "Autre" })
    assert error
  end

  test "update_document rewrites the text of a Markdown document, never of another file" do
    data, error = call_tool(@owner, "add_document", { map_id: @map.id, title: "Journal", content: "# Journal\n\n- Gelée" })
    refute error
    doc = @map.documents.find(data["id"])
    _, error = call_tool(@owner, "update_document", { map_id: @map.id, document_id: doc.id, content: "# Journal\n\n- Gelée\n- Floraison du cornouiller" })
    refute error
    doc.reload
    assert_equal "# Journal\n\n- Gelée\n- Floraison du cornouiller", doc.markdown_content
    assert_equal [ "journal.md", users(:michael) ], [ doc.file.filename.to_s, doc.content_edited_by ]
    assert_equal 45, AiAction.last.arguments["content_chars"], "the text is not copied into the journal"

    data, = call_tool(@owner, "add_document", { map_id: @map.id, title: "Relevé", content: "a,b", format: "csv" })
    text, error = call_tool(@owner, "update_document", { map_id: @map.id, document_id: data["id"], content: "c,d" })
    assert error
    assert_match(/Markdown/, text)
    assert_equal "a,b", @map.documents.find(data["id"]).file.download
  end
end

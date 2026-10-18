require "test_helper"

class SiteVisitTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @michael = users(:michael)
    @key = "visit-#{SecureRandom.hex(6)}"
  end

  def note!(text, theme: nil, at: Time.zone.parse("2026-10-18 14:12"), key: @key)
    feature = @map.features.create!(layer: "notes", kind: "note_point", name: text, created_at: at,
      geometry: { "type" => "Point", "coordinates" => [ 4.906, 50.341 ] }, properties: { "visit" => key, "theme" => theme }.compact, created_by: @michael)
    SiteVisit.for_note!(feature, by: @michael)
    feature
  end

  test "the first note of a visit begins it, an earlier one moves its start back" do
    note!("Mare qui déborde", theme: "water")
    visit = @map.site_visits.find_by!(key: @key)
    assert_equal @michael, visit.user
    assert_equal Time.zone.parse("2026-10-18 14:12"), visit.started_at
    note!("Vue sur la vallée", at: Time.zone.parse("2026-10-18 14:02"))
    assert_equal Time.zone.parse("2026-10-18 14:02"), visit.reload.started_at
    assert_equal 2, visit.notes.count
    assert_equal 1, @map.site_visits.count
  end

  test "a note outside any visit, or with a malformed key, makes no visit" do
    feature = @map.features.create!(layer: "notes", kind: "note_point", name: "x", geometry: { "type" => "Point", "coordinates" => [ 4.906, 50.341 ] }, properties: {})
    assert_nil SiteVisit.for_note!(feature, by: @michael)
    note!("y", key: "bad key!")
    assert_equal 0, @map.site_visits.count
  end

  test "the report groups the notes by theme, questions last as a checklist" do
    note!("Une mare visible depuis la cuisine", theme: "wish")
    note!("Fond du terrain très humide, drain ?", theme: "question", at: Time.zone.parse("2026-10-18 14:30"))
    note!("Argile lourde à 20 cm", theme: "soil", at: Time.zone.parse("2026-10-18 14:20"))
    note!("Chemin des ânes")
    visit = @map.site_visits.find_by!(key: @key)
    visit.update!(ended_at: Time.zone.parse("2026-10-18 15:20"))
    report = visit.report_markdown
    assert_match(/\A# Visite du 18 octobre 2026\n/, report)
    assert_includes report, "de 14 h 12 à 15 h 20 · 4 notes"
    assert_operator report.index("## Envies du porteur"), :<, report.index("## Sol")
    assert_operator report.index("## Sol"), :<, report.index("## Questions en suspens")
    assert_includes report, "- [ ] 14 h 30 · Fond du terrain très humide, drain ?"
    assert_includes report, "## Autres notes\n\n- 14 h 12 · Chemin des ânes"
  end

  test "closing files the report once and turns the chosen questions into tasks once" do
    question = note!("Où fuit le trop-plein ?", theme: "question")
    other = note!("Mare pleine", theme: "water")
    visit = @map.site_visits.find_by!(key: @key)
    visit.close!(ended_at: Time.zone.parse("2026-10-18 15:00"), by: @michael, question_ids: [ question.id, other.id ])
    document = visit.map_document
    assert document.markdown?
    assert_equal "Visite du 18 octobre 2026", document.title
    assert_includes document.markdown_content, "Où fuit le trop-plein ?"
    task = @map.tasks.sole
    assert_equal "Où fuit le trop-plein ?", task.title
    assert_equal [ question ], task.features.to_a
    assert_equal SiteVisit::TASK_LIST_KEY, task.task_list.key

    document.replace_markdown!("# Mon compte rendu", by: @michael)
    visit.close!(ended_at: Time.zone.parse("2026-10-18 15:30"), by: @michael, question_ids: [ question.id ])
    assert_equal document, visit.reload.map_document
    assert_equal "# Mon compte rendu", document.reload.markdown_content
    assert_equal 1, @map.tasks.count
    assert_equal Time.zone.parse("2026-10-18 15:30"), visit.ended_at
  end

  test "a visit never ends before it began" do
    note!("x")
    visit = @map.site_visits.find_by!(key: @key)
    visit.close!(ended_at: visit.started_at - 1.hour, by: @michael)
    assert_equal visit.started_at, visit.ended_at
  end

  test "a note sent late keeps the time the phone took it, never a future one" do
    feature = @map.features.create!(layer: "notes", kind: "note_point", name: "Haie de prunelliers", geometry: { "type" => "Point", "coordinates" => [ 4.906, 50.341 ] },
      properties: { "visit" => @key, "taken_at" => 2.hours.ago.iso8601 })
    visit = SiteVisit.for_note!(feature, by: @michael)
    assert_in_delta 2.hours.ago, visit.started_at, 5
    feature.update!(properties: feature.properties.merge("taken_at" => 3.days.from_now.iso8601))
    assert_in_delta feature.created_at, SiteVisit.taken_at(feature), 1
  end
end

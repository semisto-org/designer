require "test_helper"

class TaskTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
    @list = @map.task_lists.create!(name: "Chantier de mars")
  end

  test "tasks are appended to their list" do
    first = @list.tasks.create!(title: "Commander le broyat")
    second = @list.tasks.create!(title: "Prévenir les voisins")
    assert_equal [ 0, 1 ], [ first.position, second.position ]
    assert_equal @map, first.map
  end

  test "the title is required and squished" do
    assert_not @list.tasks.new(title: "  ").valid?
    assert_equal "Planter les haies", @list.tasks.create!(title: "  Planter   les haies ").title
  end

  test "only a participant of the map can be assigned" do
    assert @list.tasks.new(title: "Tailler", assignee: users(:alice)).valid?
    task = @list.tasks.new(title: "Tailler", assignee: users(:bob))
    assert_not task.valid?
    assert_includes task.errors[:assignee], "doit participer à la carte"
  end

  test "a list of another map is refused" do
    other = Map.create!(name: "Autre", owner: users(:bob), region: regions(:wallonia), center: "SRID=4326;POINT(4.9 50.3)")
    task = @list.tasks.new(title: "Tailler", map: other)
    assert_not task.valid?
  end

  test "completed ticks and unticks" do
    task = @list.tasks.create!(title: "Pailler")
    task.update!(completed: "1")
    assert task.done?
    task.update!(completed: false)
    assert_not task.done?
    assert_nil task.completed_by
  end

  test "overdue: pending with a past due date" do
    task = @list.tasks.create!(title: "Pailler", due_on: Date.new(2026, 10, 1))
    assert task.overdue?(Date.new(2026, 10, 11))
    assert_not task.overdue?(Date.new(2026, 9, 30))
    assert_equal [ task ], @map.tasks.overdue(Date.new(2026, 10, 11)).to_a
  end

  test "tags follow the elements' rules" do
    task = @list.tasks.create!(title: "Pailler", tags: [ " Phase 1 ", "phase 1", "Zone nord" ])
    assert_equal [ "Phase 1", "Zone nord" ], task.tags
    assert_equal [ task ], @map.tasks.tagged("PHASE 1").to_a
    assert_equal({ "Phase 1" => 1, "Zone nord" => 1 }, @map.tasks.tag_counts)
  end

  test "a task moves within and across lists" do
    a, b, c = %w[A B C].map { |title| @list.tasks.create!(title:) }
    c.move_to!(@list, 0)
    assert_equal %w[C A B], @list.tasks.reload.map(&:title)

    other = @map.task_lists.create!(name: "Devis")
    x = other.tasks.create!(title: "X")
    a.move_to!(other, 0)
    assert_equal %w[A X], other.tasks.reload.map(&:title)
    assert_equal %w[C B], @list.tasks.reload.map(&:title)
    assert_equal [ 0, 1 ], @list.tasks.map(&:position)
    assert_equal [ 0, 1 ], [ a.reload.position, x.reload.position ]
  end

  test "as_json says when the map already shows a default task done" do
    task = @list.tasks.create!(title: "Contour", key: "boundary")
    json = task.as_json(journey_done: [ "boundary" ])
    assert_equal true, json[:mapSaysDone]
    assert_equal "terrain", json[:panel]
    assert_nil @list.tasks.create!(title: "Libre").as_json[:mapSaysDone]
  end
end

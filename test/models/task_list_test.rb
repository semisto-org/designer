require "test_helper"

class TaskListTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  test "lists are appended and reordered" do
    a, b, c = %w[A B C].map { |name| @map.task_lists.create!(name:) }
    c.move_to!(0)
    assert_equal %w[C A B], @map.task_lists.reload.map(&:name)
    c.move_to!(99)
    assert_equal %w[A B C], @map.task_lists.reload.map(&:name)
  end

  test "a name is required" do
    assert_not @map.task_lists.new(name: " ").valid?
  end

  test "deleting a list deletes its tasks" do
    list = @map.task_lists.create!(name: "Devis")
    list.tasks.create!(title: "Demander un devis")
    assert_difference -> { Task.count }, -1 do
      list.destroy!
    end
  end

  test "Semisto's default lists are added once, one per step" do
    assert TaskList::Defaults.seed!(@map, by: users(:michael))
    assert_equal [ "Observer le lieu", "Cartographier l'existant", "Concevoir", "Planter" ], @map.task_lists.map(&:name)
    assert_equal 18, @map.tasks.count
    first = @map.task_lists.first.tasks.first
    assert_equal "Remplir la fiche projet", first.title
    assert_match "tout le design en découle", first.notes
    assert_equal users(:michael), first.created_by

    @map.task_lists.destroy_all
    assert_not TaskList::Defaults.seed!(@map.reload)
    assert_empty @map.task_lists.reload
  end

  test "the missing default lists can be put back" do
    TaskList::Defaults.seed!(@map)
    @map.task_lists.find_by(key: "plant").destroy!
    TaskList::Defaults.add_missing!(@map)
    assert_equal %w[observe map design plant], @map.task_lists.reload.map(&:key)
  end

  test "every default task has its texts and a known panel" do
    panels = File.read(Rails.root.join("app/frontend/map/panels/index.ts")).scan(/id: '([a-z-]+)'/).flatten
    TaskList::Defaults::LISTS.each do |list_key, tasks|
      assert I18n.exists?("tasks.defaults.#{list_key}.name")
      tasks.each do |task_key, options|
        assert I18n.exists?("tasks.defaults.#{list_key}.tasks.#{task_key}.title"), task_key
        assert I18n.exists?("tasks.defaults.#{list_key}.tasks.#{task_key}.notes"), task_key
        assert_includes panels, options[:panel], task_key if options[:panel]
        assert_includes Journey.new(@map).items.map(&:key) + [ "layers_seen" ], options[:journey], task_key if options[:journey]
      end
    end
  end
end

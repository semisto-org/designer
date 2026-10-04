require "test_helper"

class JourneyTest < ActiveSupport::TestCase
  setup do
    @map = Map.create!(name: "Jardin test", owner: users(:bob), region: regions(:wallonia))
  end

  def item(journey, key) = journey.items.find { _1.key == key }

  def add_feature(layer, kind = "tree", status: "active", geometry: point)
    @map.features.create!(layer:, kind:, geometry:, status:)
  end

  test "a new map starts at observe: nothing done, next action is the project sheet" do
    journey = Journey.new(@map)
    assert_equal "observe", journey.as_json[:stage]
    assert_equal %w[observe map design plant], journey.steps.map { _1[:key] }
    assert_equal [ true, false, false, false ], journey.steps.map { _1[:current] }
    assert_equal false, item(journey, "project_sheet").done
    assert_equal 0, item(journey, "project_sheet").progress
    assert_equal({ type: "item", step: "observe", item: "project_sheet", panel: "project" }, journey.next_action)
  end

  test "the project sheet item follows the completion of the sheet" do
    @map.update!(project: { "who" => { "people" => [ { "name" => "Marie" } ], "profile" => "individual", "experience" => "some" },
                            "ambitions" => { "goals" => [ "biodiversity" ], "main_goal" => "biodiversity" },
                            "uses" => { "uses" => [ "eat_fresh" ], "presence" => "weekends" },
                            "meta" => { "done" => %w[budget time skills] } })
    done = item(Journey.new(@map), "project_sheet")
    assert_equal 60, done.progress
    assert done.done, "60 percent is the threshold"
    @map.update!(project: {})
    assert_equal false, item(Journey.new(@map), "project_sheet").done
  end

  test "layers seen is a flag only the browser knows, passed in as seen" do
    assert_equal false, item(Journey.new(@map), "layers_seen").done
    assert item(Journey.new(@map, seen: "layers_seen"), "layers_seen").done
    assert item(Journey.new(@map, seen: [ "layers_seen" ]), "layers_seen").done
    assert_equal false, item(Journey.new(@map, seen: "something_else"), "layers_seen").done
    assert item(Journey.new(@map), "layers_seen").as_json[:client]
  end

  test "when the current step is complete the next action is to advance, then to be done" do
    @map.update!(project: { "meta" => { "done" => ProjectSheet::SECTIONS.keys } })
    journey = Journey.new(@map, seen: "layers_seen")
    assert_equal true, journey.steps.first[:done]
    assert_equal({ type: "advance", stage: "map" }, journey.next_action)

    @map.update!(stage: "plant")
    add_feature("plants")
    @map.service_requests.create!(user: users(:bob), kind: "co_management", contact_consent: true, payload: { "message" => "Merci" })
    assert_equal({ type: "complete" }, Journey.new(@map.reload).next_action)
  end

  test "map step: outline drawn, then at least three existing elements" do
    @map.update!(stage: "map")
    assert_equal "boundary", Journey.new(@map).next_action[:item]
    assert_equal "terrain", Journey.new(@map).next_action[:panel]

    @map.update!(boundary: square)
    journey = Journey.new(@map.reload)
    assert item(journey, "boundary").done
    assert_equal "existing", journey.next_action[:item]

    add_feature("existing", "building", geometry: square)
    add_feature("existing", "tree")
    assert_equal 2, item(Journey.new(@map), "existing").count
    assert_equal false, item(Journey.new(@map), "existing").done
    add_feature("existing", "wet_area", geometry: square)
    assert item(Journey.new(@map), "existing").done
    assert_equal({ type: "advance", stage: "design" }, Journey.new(@map.reload).next_action)
  end

  test "drafts and rejected features do not count" do
    add_feature("existing", "tree", status: "draft")
    add_feature("existing", "tree", status: "rejected")
    add_feature("plants", "tree", status: "draft")
    journey = Journey.new(@map)
    assert_equal 0, item(journey, "existing").count
    assert_equal 0, item(journey, "plant_plan").count
  end

  test "design step counts design layers, not existing elements nor plants" do
    @map.update!(stage: "design")
    add_feature("existing")
    add_feature("plants")
    assert_equal false, item(Journey.new(@map), "design_elements").done
    add_feature("water", "pond", geometry: square)
    assert item(Journey.new(@map), "design_elements").done
  end

  test "plant step: plants placed and a request sent" do
    @map.update!(stage: "plant")
    journey = Journey.new(@map)
    assert_equal "plant_plan", journey.next_action[:item]
    add_feature("plants")
    journey = Journey.new(@map)
    assert item(journey, "plant_plan").done
    assert_equal "take_action", journey.next_action[:item]
    assert_equal "actions", journey.next_action[:panel]
    @map.service_requests.create!(user: users(:bob), kind: "order_plants", contact_consent: true, payload: { "plants_free_text" => "Noisetiers" })
    assert item(Journey.new(@map), "take_action").done
  end

  test "palette and plant list items follow the plants area" do
    journey = Journey.new(@map)
    refute item(journey, "palette").done
    refute item(journey, "plant_list").done

    @map.palette_items.create!(species: plant_species(:apple))
    @map.features.create!(layer: "plants", kind: "plant", geometry: point, properties: { "species_id" => plant_species(:apple).id })
    journey = Journey.new(@map)
    assert item(journey, "palette").done
    assert_equal "design", item(journey, "palette").step
    assert_equal 1, item(journey, "plant_list").count
    assert item(journey, "plant_list").done
    assert_equal "plant-list", item(journey, "plant_list").panel
  end

  test "a broken palette never breaks the journey" do
    @map.define_singleton_method(:palette_items) { raise "boom" }
    assert_nil item(Journey.new(@map), "palette")
  end

  test "step summaries only count items the server can evaluate" do
    add_feature("plants")
    plant = Journey.new(@map).steps.find { _1[:key] == "plant" }
    assert_equal 2, plant[:completed]
    assert_equal 3, plant[:total]
    assert_equal false, plant[:done]
  end

  test "as_json is what the frontend reads" do
    json = Journey.new(@map).as_json
    assert_equal %i[stage stageIndex steps next], json.keys
    assert_equal 0, json[:stageIndex]
    first_item = json[:steps].first[:items].first
    assert_equal "project_sheet", first_item[:key]
    assert_equal "observe", first_item[:step]
  end

  test "every item and step has French labels" do
    Journey.new(@map).items.each do |i|
      assert I18n.exists?("journey.items.#{i.key}.label"), i.key
    end
    Journey::STEPS.each { |s| assert I18n.exists?("journey.steps.#{s}.summary"), s }
  end
end

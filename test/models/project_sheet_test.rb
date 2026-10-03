require "test_helper"

class ProjectSheetTest < ActiveSupport::TestCase
  test "an empty or missing sheet is valid and empty" do
    assert_predicate ProjectSheet.parse(nil), :valid?
    assert_equal({}, ProjectSheet.parse({}).to_h)
  end

  test "keeps typed answers and drops unknown sections and keys" do
    sheet = ProjectSheet.parse(
      { "budget" => { "initial" => "up_to_2000", "spend_priorities" => %w[implementation quality_plants], "bogus" => "x" },
      "nonsense" => { "a" => 1 } }
    )
    assert_predicate sheet, :valid?
    assert_equal(
      { "budget" => { "initial" => "up_to_2000", "spend_priorities" => %w[quality_plants implementation] } },
      sheet.to_h, "multi values come back in the schema's order, unknown keys are dropped"
    )
  end

  test "strict parsing reports every invalid value with its path" do
    sheet = ProjectSheet.parse(
      { "budget" => { "initial" => "a_fortune", "spend_priorities" => [ "quality_plants", "gold" ] },
      "time" => { "hours_per_week" => 400, "seasons" => "summer" },
      "uses" => { "notes" => 12 },
      "calendar" => { "start_year" => "soon" } }
    )
    assert_not_predicate sheet, :valid?
    assert_equal :inclusion, sheet.errors["budget.initial"]
    assert_equal :inclusion, sheet.errors["budget.spend_priorities"]
    assert_equal :out_of_range, sheet.errors["time.hours_per_week"]
    assert_equal :not_a_list, sheet.errors["time.seasons"]
    assert_equal :not_a_string, sheet.errors["uses.notes"]
    assert_equal :not_an_integer, sheet.errors["calendar.start_year"]
  end

  test "lenient parsing silently drops what no longer fits" do
    sheet = ProjectSheet.parse({ "budget" => { "initial" => "removed_value", "yearly" => "under_100" } }, strict: false)
    assert_predicate sheet, :valid?
    assert_equal({ "budget" => { "yearly" => "under_100" } }, sheet.to_h)
  end

  test "rejects a sheet that is not a hash" do
    assert_not_predicate ProjectSheet.parse("hello"), :valid?
    assert_not_predicate ProjectSheet.parse({ "who" => "me" }), :valid?
  end

  test "integers accept numeric strings, not decimals or text" do
    assert_equal 12, ProjectSheet.parse({ "time" => { "hours_per_week" => "12" } }).values.dig("time", "hours_per_week")
    assert_equal 0, ProjectSheet.parse({ "time" => { "hours_per_week" => 0 } }).values.dig("time", "hours_per_week")
    assert_not_predicate ProjectSheet.parse({ "time" => { "hours_per_week" => "12.5" } }), :valid?
    assert_not_predicate ProjectSheet.parse({ "time" => { "hours_per_week" => -1 } }), :valid?
  end

  test "free text is stripped and limited" do
    sheet = ProjectSheet.parse({ "ambitions" => { "notes" => "  Une forêt comestible \r\n et belle  " } })
    assert_equal "Une forêt comestible \n et belle", sheet.values.dig("ambitions", "notes")
    too_long = ProjectSheet.parse({ "ambitions" => { "notes" => "a" * 2_001 } })
    assert_equal :too_long, too_long.errors["ambitions.notes"]
  end

  test "exclusive answers cannot be combined" do
    sheet = ProjectSheet.parse({ "livestock" => { "species" => %w[chickens none bees] } })
    assert_equal [ "none" ], sheet.values.dig("livestock", "species")
    sheet = ProjectSheet.parse({ "constraints" => { "regulation" => %w[heritage unknown none] } })
    assert_equal [ "none" ], sheet.values.dig("constraints", "regulation"), "first exclusive in schema order wins"
  end

  test "people: rows need a name, are typed and capped" do
    sheet = ProjectSheet.parse({ "who" => { "people" => [
      { "name" => "Marie", "role" => "lead", "note" => "Porte le projet", "evil" => "x" },
      { "name" => "", "role" => "partner" },
      { "name" => "Paul", "role" => "king" }
    ] } })
    assert_equal :inclusion, sheet.errors["who.people.2.role"]
    ok = ProjectSheet.parse({ "who" => { "people" => [ { "name" => "Marie", "role" => "lead", "evil" => "x" }, { "name" => " " } ] } })
    assert_predicate ok, :valid?
    assert_equal [ { "name" => "Marie", "role" => "lead" } ], ok.values.dig("who", "people")
    many = ProjectSheet.parse({ "who" => { "people" => Array.new(13) { |i| { "name" => "P#{i}" } } } })
    assert_equal :too_many, many.errors["who.people"]
  end

  test "reads ActionController::Parameters" do
    params = ActionController::Parameters.new(budget: { initial: "under_500" })
    assert_equal({ "budget" => { "initial" => "under_500" } }, ProjectSheet.parse(params).to_h)
  end

  test "merge applies a patch at field level: untouched fields and sections stay, blanks clear" do
    stored = { "budget" => { "initial" => "under_500", "yearly" => "under_100" }, "time" => { "hours_per_week" => 5 } }
    merged = ProjectSheet.merge(stored, { "budget" => { "initial" => "up_to_2000", "yearly" => "" } }, now: Time.utc(2026, 10, 4, 9))
    assert_equal({ "initial" => "up_to_2000" }, merged.to_h["budget"])
    assert_equal({ "hours_per_week" => 5 }, merged.to_h["time"])
    assert_equal "2026-10-04T09:00:00Z", merged.to_h.dig("meta", "touched", "budget")
    assert_nil merged.to_h.dig("meta", "touched", "time"), "untouched sections keep their own timestamp (none here)"
  end

  test "merge removes a section when all its fields are cleared" do
    merged = ProjectSheet.merge({ "budget" => { "initial" => "under_500" } }, { "budget" => { "initial" => nil } })
    assert_not merged.to_h.key?("budget")
  end

  test "merge never lets the client set timestamps or unknown meta" do
    patch = { "meta" => { "touched" => { "who" => "2020-01-01T00:00:00Z" }, "evil" => 1 }, "who" => { "profile" => "farm" } }
    merged = ProjectSheet.merge({}, patch, now: Time.utc(2026, 10, 4))
    assert_equal "2026-10-04T00:00:00Z", merged.to_h.dig("meta", "touched", "who")
    assert_not merged.to_h["meta"].key?("evil")
  end

  test "done flags are validated and kept across merges" do
    merged = ProjectSheet.merge({}, { "meta" => { "done" => %w[skills who] } })
    assert_equal %w[who skills], merged.to_h.dig("meta", "done")
    assert_not_predicate ProjectSheet.parse({ "meta" => { "done" => [ "nope" ] } }), :valid?
    kept = ProjectSheet.merge(merged.to_h, { "who" => { "profile" => "farm" } })
    assert_equal %w[who skills], kept.to_h.dig("meta", "done")
    cleared = ProjectSheet.merge(merged.to_h, { "meta" => { "done" => [] } })
    assert_nil cleared.to_h.dig("meta", "done")
  end

  test "progress: share of counting fields answered per section, mean overall" do
    empty = ProjectSheet.parse({}).progress
    assert_equal 0, empty[:percent]
    assert_equal "who", empty[:nextSection]
    assert_equal "empty", empty[:sections]["who"][:status]

    sheet = ProjectSheet.parse(
      { "who" => { "people" => [ { "name" => "Marie" } ], "profile" => "individual", "experience" => "some", "notes" => "Bonjour" },
      "budget" => { "initial" => "under_500" } }
    )
    progress = sheet.progress
    assert_equal 100, progress[:sections]["who"][:percent], "free text does not count"
    assert_equal "complete", progress[:sections]["who"][:status]
    assert_equal 33, progress[:sections]["budget"][:percent] # 1 of 3 counting fields
    assert_equal "partial", progress[:sections]["budget"][:status]
    assert_equal "ambitions", progress[:nextSection]
    assert_equal ((100 + 33) / 10.0).round, progress[:percent]
  end

  test "marking a section done makes it 100 percent without answers" do
    sheet = ProjectSheet.parse({ "meta" => { "done" => [ "livestock" ] } })
    section = sheet.progress[:sections]["livestock"]
    assert_equal 100, section[:percent]
    assert_equal "complete", section[:status]
    assert section[:done]
  end

  test "schema_json describes every section for the frontend" do
    schema = ProjectSheet.schema_json
    assert_equal %w[who ambitions uses budget time skills constraints opportunities livestock calendar], schema[:sections].map { _1[:key] }
    budget = schema[:sections].find { _1[:key] == "budget" }[:fields].find { _1[:key] == "initial" }
    assert_equal "enum", budget[:type]
    assert_includes budget[:values], "up_to_2000"
    hours = schema[:sections].find { _1[:key] == "time" }[:fields].find { _1[:key] == "hours_per_week" }
    assert_equal [ 0, 80 ], hours[:range]
  end

  test "every declared section, field and option has a French label" do
    ProjectSheet::SECTIONS.each do |section, fields|
      assert I18n.exists?("journey.project.sections.#{section}.title"), "title of #{section}"
      fields.each do |field|
        base = "journey.project.sections.#{section}.fields.#{field.key}"
        assert I18n.exists?("#{base}.label"), "label of #{section}.#{field.key}"
        field.values&.each { |value| assert I18n.exists?("#{base}.options.#{value}"), "option #{value} of #{section}.#{field.key}" }
        field.item&.each do |item|
          assert I18n.exists?("#{base}.item.#{item.key}.label"), "item label #{section}.#{field.key}.#{item.key}"
          item.values&.each { |value| assert I18n.exists?("#{base}.item.#{item.key}.options.#{value}") }
        end
      end
    end
  end
end

require "test_helper"
require "test_helpers/territories_test_helper"

class TerritoryNotebookTest < ActiveSupport::TestCase
  setup do
    @team = make_team("Semisto", admin: users(:michael))
    @team.grant_territory_module!
    @territory = make_territory(@team)
  end

  def add(kind, title, status: "active", geometry: nil, **properties)
    @territory.items.create!(kind:, title:, status:, geometry:, properties:, source: status == "draft" ? "ai" : "human", rationale: ("Trouvé en ligne." if status == "draft"))
  end

  def notebook(version) = TerritoryNotebook.new(@territory, version:).as_inertia

  test "leads come soil first, hypotheses apart, farmland waits for the farmer" do
    add("lead", "Ouvrage en bas", rank: "structure", land: "public", seen_on_site: true, geometry: inside_point)
    add("lead", "Couvert d'hiver", rank: "soil", land: "agricultural", seen_on_site: true, farmer: { contacted_on: "2026-11-02", answer: "yes" })
    add("lead", "Haie à voir", rank: "slow", land: "public")
    add("lead", "Fascine chez un exploitant", rank: "slow", land: "agricultural", seen_on_site: true)
    add("lead", "Brouillon", status: "draft", rank: "soil", land: "public", seen_on_site: true)

    working = notebook("working")
    assert_equal [ "Couvert d'hiver", "Ouvrage en bas" ], working[:leads].map { _1[:title] }
    assert_equal [ "Haie à voir" ], working[:hypotheses].map { _1[:title] }
    assert_equal 1, working[:waitingForFarmer]
  end

  test "the public version: no hypotheses, no farmer, no outline on private land, seen markers only" do
    add("lead", "Haie publique", land: "public", seen_on_site: true, geometry: inside_point)
    add("lead", "Haie privée", land: "private", seen_on_site: true, farmer: { answer: "yes", contacted_on: "2026-11-02" }, geometry: inside_point)
    add("lead", "Hypothèse", land: "public", geometry: inside_point, first_step: 1)
    add("marker", "Calculé", proof: "computed", geometry: inside_point)
    add("marker", "Vu", proof: "seen", geometry: inside_point)

    public_notebook = notebook("public")
    assert_empty public_notebook[:hypotheses]
    assert_empty public_notebook[:firstSteps]
    leads = public_notebook[:leads].index_by { _1[:title] }
    assert leads["Haie publique"][:geometry]
    assert_nil leads["Haie privée"][:geometry]
    assert_nil leads["Haie privée"][:farmer]
    assert_equal [ "Vu" ], public_notebook[:shows][:markers].map { _1[:title] }
    assert_equal [ "lead", "marker" ], public_notebook[:mapFeatures].map { _1[:properties][:kind] }.sort

    working = notebook("working")
    assert_equal [ "Calculé", "Vu" ], working[:shows][:markers].map { _1[:title] }.sort
    assert_equal [ "Hypothèse" ], working[:firstSteps].map { _1[:title] }
    refute working[:mapFeatures].any? { _1[:properties][:title] == "Hypothèse" }, "a hypothesis is never on the map"
  end

  test "a lead the farmer refused or is weighing stays out of the public version, and is never drawn on the field" do
    farmer = ->(answer) { { contacted_on: "2026-11-02", answer: } }
    add("lead", "Haie acceptée", land: "agricultural", seen_on_site: true, geometry: inside_point, farmer: farmer.("yes"))
    add("lead", "Haie refusée", land: "agricultural", seen_on_site: true, geometry: inside_point, farmer: farmer.("no"))
    add("lead", "Haie en réflexion", land: "agricultural", seen_on_site: true, geometry: inside_point, farmer: farmer.("thinking"))
    add("lead", "Foncier inconnu", seen_on_site: true, geometry: inside_point)

    assert_equal [ "Haie acceptée" ], notebook("public")[:leads].map { _1[:title] }

    working = notebook("working")
    assert_equal [ "Haie acceptée", "Haie en réflexion", "Haie refusée" ], working[:leads].map { _1[:title] }.sort
    assert_equal 1, working[:waitingForFarmer]
    drawn = working[:mapFeatures].map { _1[:properties][:title] }
    refute_includes drawn, "Haie refusée"
    assert_includes drawn, "Haie en réflexion"
  end

  test "expectations name their sources" do
    source = add("source", "PCDN 2016", url: "https://example.org/pcdn.pdf")
    add("expectation", "Restaurer les haies", year: 2016, source_ids: [ source.id ])
    expectation = notebook("working")[:says][:expectations].sole
    assert_equal [ "PCDN 2016" ], expectation[:sources].map { _1[:title] }
    refute expectation[:validated]
  end
end

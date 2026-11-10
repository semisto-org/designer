require "test_helper"
require_relative "../../test_helpers/teams_test_helper"

class Teams::ProjectPreviewTest < ActiveSupport::TestCase
  TODAY = Date.new(2026, 11, 10)

  setup do
    @team = make_team("Design Labs", admin: users(:michael), members: [ users(:bob) ])
    @map = maps(:ahinvaux)
    @map.update!(organization: @team)
    @map.update_board!(phase: "offer", lead_id: users(:bob).id, crew_ids: [ users(:michael).id ], promised_on: "2026-12-01", promised_what: "L'offre")
    @list = @map.task_lists.create!(name: "Suivi du projet")
  end

  def preview(user = users(:michael)) = Teams::ProjectPreview.new(@map.reload, user, today: TODAY).as_json

  test "where the project stands, its people and what was promised" do
    data = preview
    assert_equal [ "offer", "L'offre", "2026-12-01" ], data.values_at(:phase, :promisedWhat, :promisedOn)
    assert_equal users(:bob).id, data[:lead][:id]
    assert_equal [ users(:michael).id ], data[:crew].map { _1[:id] }
    assert_operator data[:daysInPhase], :>=, 0
  end

  test "the next action, the ones after it, the overdue ones and what was done lately" do
    @list.tasks.create!(title: "Envoyer l'offre", due_on: TODAY + 2, assignee: users(:bob))
    @list.tasks.create!(title: "Appeler", due_on: TODAY - 3)
    @list.tasks.create!(title: "Visite", due_on: TODAY + 9, assignee: users(:michael))
    @list.tasks.create!(title: "Sans date ni personne")
    @list.tasks.create!(title: "Relevé", completed_at: TODAY - 1, completed_by: users(:bob))
    @list.tasks.create!(title: "Premier appel", completed_at: TODAY - 8)
    TaskList.season!(@map, by: users(:michael)).tasks.create!(title: "Design", step_kind: "design",
      starts_on: TODAY + 20, due_on: TODAY + 60, forecast: true)

    data = preview
    assert_equal [ "Appeler", true ], data[:nextStep].values_at(:title, :overdue)
    assert_equal [ "Envoyer l'offre", "Visite" ], data[:coming].map { _1[:title] }
    assert_equal 1, data[:overdue]
    assert_equal [ "Relevé", "Premier appel" ], data[:done].map { _1[:title] }
    assert_equal "Bob", data[:done].first[:completedBy].split.first
    assert_equal [ [ "Suivi du projet", 2, 6 ] ], data[:lists].map { _1.values_at(:name, :done, :total) }
    assert_equal [ [ "design", true ] ], data[:steps].map { _1.values_at(:kind, :forecast) }
  end

  test "how far the offer went, never its amount" do
    assert_equal({ url: "/maps/#{@map.id}/offer", exists: false, version: nil, status: nil, statusOn: nil, versions: 0 }, preview[:offer])
    offer = Offer.build_for(@map)
    offer.save!
    offer.save_version!(user: users(:michael))
    offer.versions.last.update!(status: "sent")
    data = preview[:offer]
    assert_equal [ true, "V1", "sent", 1 ], data.values_at(:exists, :version, :status, :versions)
    refute preview.to_s.include?("tvac")
  end

  test "the request the map came from" do
    form = RequestForm.create!(owner: @team)
    form.project_requests.create!(name: "Marie Dupont", email: "marie@example.org", map: @map)
    assert_equal "Marie Dupont", preview[:request][:name]
  end

  test "for an AI: the same story, without the client's name" do
    @list.tasks.create!(title: "Envoyer l'offre", due_on: TODAY + 2, assignee: users(:bob))
    form = RequestForm.create!(owner: @team)
    form.project_requests.create!(name: "Marie Dupont", email: "marie@example.org", map: @map)
    data = Teams::ProjectPreview.new(@map.reload, users(:michael), today: TODAY).for_mcp
    assert_equal [ "offer", "Offre" ], data.values_at(:stage, :stage_label)
    assert_equal "Envoyer l'offre", data.dig(:next_action, :title)
    assert_equal users(:bob).display_name, data.dig(:project_manager, :name)
    assert data[:request_received_on]
    refute data.to_s.include?("Marie")
  end
end

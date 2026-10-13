require "test_helper"

class ProjectRequestTest < ActiveSupport::TestCase
  setup do
    @form = RequestForm.create!(owner: users(:michael))
  end

  test "answers are typed like the project sheet; unknown values are refused" do
    values, errors = ProjectRequest.parse_answers({ "profile" => "individual", "services" => %w[design planting], "budget" => "up_to_5000",
                                                    "water" => %w[well], "slope" => "gentle", "colour" => "blue" })
    assert_empty errors
    assert_equal({ "profile" => "individual", "services" => %w[design planting], "budget" => "up_to_5000", "water" => %w[well], "slope" => "gentle" }, values)

    _, errors = ProjectRequest.parse_answers({ "budget" => "a million" })
    assert errors.key?("answers.budget")
  end

  test "what the request gives the map's project sheet" do
    request = @form.project_requests.create!(name: " Marie  Dupont ", email: "Marie@Example.org ", message: "Un verger pour l'école",
      answers: { "profile" => "school", "budget" => "up_to_2000", "water" => %w[tap_only], "access" => %w[narrow], "services" => %w[design] })
    assert_equal [ "Marie Dupont", "marie@example.org" ], [ request.name, request.email ]
    patch = request.project_patch
    assert_equal [ { "name" => "Marie Dupont", "role" => "lead" } ], patch["who"]["people"]
    assert_equal "school", patch["who"]["profile"]
    assert_equal({ "initial" => "up_to_2000" }, patch["budget"])
    assert_equal({ "water" => %w[tap_only], "access" => %w[narrow] }, patch["constraints"])
    assert_equal "Un verger pour l'école", patch["ambitions"]["notes"]
    assert ProjectSheet.parse(patch, strict: true).valid?
  end

  test "a status change is dated; a bad e-mail or status is refused" do
    request = @form.project_requests.create!(name: "Marie", email: "marie@example.org")
    assert_nil request.status_changed_at
    request.update!(status: "called")
    assert request.status_changed_at
    assert_not request.update(status: "lost")
    assert_not @form.project_requests.new(name: "X", email: "pas un e-mail").valid?
  end
end

require "test_helper"
require_relative "../test_helpers/teams_test_helper"

class RequestFormTest < ActiveSupport::TestCase
  test "a slug from the account's name, unique, and who reads and writes" do
    team = make_team("Semisto Design Lab", admin: users(:michael), members: [ users(:bob) ])
    form = RequestForm.create!(owner: team)
    assert_equal "semisto-design-lab", form.slug
    assert form.team?
    assert_equal "Semisto Design Lab", form.display_name
    assert_equal [ users(:michael), users(:bob) ].sort_by(&:id), form.recipients
    assert form.reader?(users(:bob))
    assert_not form.writer?(users(:bob))
    assert form.writer?(users(:michael))
    assert_not form.reader?(users(:alice))

    other = make_team("Semisto Design Lab", admin: users(:alice))
    second = RequestForm.create!(owner: other)
    assert_match(/\Asemisto-design-lab-[a-z0-9]{5}\z/, second.slug)

    mine = RequestForm.create!(owner: users(:alice))
    assert_equal "alice", mine.slug
    assert_equal [ users(:alice) ], mine.recipients
    assert_not RequestForm.new(owner: users(:alice)).valid?, "one form per account"
  end
end

require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class MentionsTest < ActiveSupport::TestCase
  setup do
    @marie = make_user("Marie Dupont")
    @marc = make_user("Marc")
    @users = [ @marie, @marc ]
  end

  test "finds people by @handle and ignores everyone else" do
    found = Collab::Mentions.parse("Merci @Marie Dupont, et @marc aussi. cc @Inconnu", @users)
    assert_equal [ @marie, @marc ].sort_by(&:id), found.sort_by(&:id)
  end

  test "the longest handle wins and a bare prefix does not match" do
    marie = make_user("Marie")
    found = Collab::Mentions.parse("@Marie Dupont regarde ça", [ marie, @marie ])
    assert_equal [ @marie ], found
  end

  test "an e-mail address is not a mention" do
    assert_empty Collab::Mentions.parse("écrivez à contact@Marc.example", @users)
    assert_empty Collab::Mentions.parse("a@marc", @users)
  end

  test "a name that continues is not a mention of the shorter name" do
    assert_empty Collab::Mentions.parse("@Marcel arrive", @users)
  end

  test "two people with the same name get distinct handles" do
    a = User.create!(name: "Alice", email_address: "alice.one@example.org")
    b = User.create!(name: "Alice", email_address: "alice.two@example.org")
    handles = Collab::Mentions.handles([ a, b ])
    assert_equal 2, handles.values.uniq.size
    assert_equal [ b ], Collab::Mentions.parse("@#{handles[b.id]} ?", [ a, b ])
  end

  test "handles with regexp characters are safe" do
    odd = make_user("Jean (jardinier) [3+]")
    assert_equal [ odd ], Collab::Mentions.parse("Salut @Jean (jardinier) [3+] !", [ odd ])
  end
end

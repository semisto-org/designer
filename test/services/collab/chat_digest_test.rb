require "test_helper"
require_relative "../../test_helpers/collab_test_helper"

class Collab::ChatDigestTest < ActiveJob::TestCase
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @edith = add_member(@map, make_user("Edith"), "editor")
    @alice = users(:alice) # viewer, outside the discussion
    clear_enqueued_jobs
  end

  def say(body, by: @owner) = Comment.create!(commentable: @map, author: by, body:)

  def digests
    ActionMailer::Base.deliveries.clear
    perform_enqueued_jobs { yield }
    ActionMailer::Base.deliveries.select { |m| m.subject.include?("discussion de") }
  end

  test "the first message books one digest an hour later; the next ones ride along" do
    freeze_time
    perform_enqueued_jobs(only: CommentNotificationJob) { say "Un" }
    assert_enqueued_jobs 1, only: ChatDigestJob
    assert_in_delta 1.hour.from_now, @map.reload.chat_digest_at, 1
    perform_enqueued_jobs(only: CommentNotificationJob) { say "Deux" }
    assert_enqueued_jobs 1, only: ChatDigestJob
  end

  test "a message is not e-mailed one by one: one digest per unread member" do
    say "Le noyer a souffert du gel", by: @owner
    say "Je passe demain", by: @owner
    mails = digests { Collab::ChatDigest.new(@map).deliver }
    assert_equal [ @edith.email_address ], mails.flat_map(&:to)
    assert_includes mails.first.subject, "2 messages"
    assert_includes mails.first.text_part.body.to_s, "Le noyer a souffert du gel"
    assert_nil @map.reload.chat_digest_at

    assert_empty digests { Collab::ChatDigest.new(@map).deliver }, "never the same messages twice"
  end

  test "read messages, mentions, muted members and viewers outside are left out" do
    say "Avant"
    travel 1.minute
    CommentRead.mark!(@edith, @map)
    travel 1.minute
    assert_empty digests { Collab::ChatDigest.new(@map).deliver }, "Edith read everything"

    say "@Edith regarde la mare"
    assert_empty digests { Collab::ChatDigest.new(@map).deliver }, "a mention was already e-mailed on its own"

    say "Et la haie ?"
    CommentSubscription.mute(@edith, @map, true)
    assert_empty digests { Collab::ChatDigest.new(@map).deliver }, "muted"

    CommentSubscription.mute(@edith, @map, false)
    @map.memberships.find_by(user: @alice).update!(chat_access: true)
    mails = digests { Collab::ChatDigest.new(@map).deliver }
    assert_equal [ @alice.email_address, @edith.email_address ].sort, mails.flat_map(&:to).sort
  end

  test "a mention in the discussion is e-mailed at once" do
    mails = digests { say "@Edith tu as vu ?" }
    assert_equal [ @edith.email_address ], ActionMailer::Base.deliveries.select { |m| m.subject.include?("mentionné") }.flat_map(&:to)
    assert_empty mails.select { |m| m.subject.start_with?("Michael a commenté") }
  end
  test "on a team map with a project team, the rest of the team gets no digest unless they turn it on" do
    team = Organization.create!(name: "Semisto")
    crew = make_user("Camille")
    outside = make_user("Olivier")
    [ crew, outside ].each { |u| team.memberships.create!(user: u, role: "member") }
    @map.update!(organization: team)

    say "Avant l'équipe du projet"
    assert_equal [ crew, @edith, outside ].map(&:email_address).sort,
      digests { Collab::ChatDigest.new(@map).deliver }.flat_map(&:to).sort, "no project team yet: the whole team"

    @map.update_board!(crew_ids: [ crew.id ])
    say "La mare déborde"
    assert_equal [ crew, @edith ].map(&:email_address).sort,
      digests { Collab::ChatDigest.new(@map).deliver }.flat_map(&:to).sort, "the project team and the map's own members"
    assert CommentSubscription.subscribed?(crew, @map)
    assert_not CommentSubscription.subscribed?(outside, @map)
    assert @map.chat_member?(outside), "still reads the discussion"

    CommentSubscription.mute(outside, @map, false)
    say "Et la haie ?"
    assert_includes digests { Collab::ChatDigest.new(@map).deliver }.flat_map(&:to), outside.email_address, "turned on with the bell"
    assert CommentSubscription.subscribed?(outside, @map)
  end

  test "a mention still reaches a team member outside the project team" do
    team = Organization.create!(name: "Semisto")
    outside = make_user("Olivier")
    team.memberships.create!(user: outside, role: "member")
    @map.update!(organization: team)
    @map.update_board!(crew_ids: [ @owner.id ])
    digests { say "@Olivier tu passes voir ?" }
    assert_includes ActionMailer::Base.deliveries.select { |m| m.subject.include?("mentionné") }.flat_map(&:to), outside.email_address
  end
end

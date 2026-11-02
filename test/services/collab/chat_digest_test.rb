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
end

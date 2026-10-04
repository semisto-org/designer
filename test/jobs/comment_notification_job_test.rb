require "test_helper"
require_relative "../test_helpers/collab_test_helper"

class CommentNotificationJobTest < ActiveJob::TestCase
  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @alice = users(:alice)      # viewer
    @edith = add_member(@map, make_user("Edith"), "editor")
    @feature = with_feature(@map)
    clear_enqueued_jobs
    ActionMailer::Base.deliveries.clear
  end

  # Runs the block with jobs performed inline (the notification job and the
  # mails it queues) and returns the mails that went out.
  def notifications
    ActionMailer::Base.deliveries.clear
    perform_enqueued_jobs { yield }
    ActionMailer::Base.deliveries.dup
  end

  test "a new comment queues the notification job once committed" do
    assert_enqueued_with(job: CommentNotificationJob) do
      Comment.create!(commentable: @feature, author: @owner, body: "Bonjour")
    end
  end

  test "subscribers get the new comment, the author does not" do
    CommentSubscription.subscribe(@alice, @feature)
    CommentSubscription.subscribe(@edith, @feature)
    mails = notifications { Comment.create!(commentable: @feature, author: @edith, body: "Je plante ici ?") }
    assert_equal [ @alice.email_address ], mails.map { |m| m.to.first }
    assert_match(/Edith a commenté/, mails.first.subject)
  end

  test "people who never subscribed hear nothing, mentioned people always do" do
    mails = notifications { Comment.create!(commentable: @feature, author: @owner, body: "Pour @Alice") }
    assert_equal [ @alice.email_address ], mails.map { |m| m.to.first }
    assert_match(/t'a mentionné/, mails.first.subject)
  end

  test "a mentioned subscriber gets one mail (the mention), not two" do
    CommentSubscription.subscribe(@alice, @feature)
    CommentSubscription.subscribe(@edith, @feature)
    mails = notifications { Comment.create!(commentable: @feature, author: @owner, body: "@Alice et les autres") }.sort_by { |m| m.to.first }
    assert_equal [ @alice.email_address, @edith.email_address ].sort, mails.map { |m| m.to.first }
    assert_match(/mentionné/, mails.find { |m| m.to.first == @alice.email_address }.subject)
    assert_match(/a commenté/, mails.find { |m| m.to.first == @edith.email_address }.subject)
  end

  test "the author is never e-mailed, even when mentioning themselves" do
    assert_empty notifications { Comment.create!(commentable: @feature, author: @alice, body: "Note pour moi-même @Alice") }
  end

  test "users who turned discussion e-mails off get nothing" do
    @alice.update!(comment_emails: false)
    CommentSubscription.subscribe(@alice, @feature)
    assert_empty notifications { Comment.create!(commentable: @feature, author: @owner, body: "Pour @Alice") }
  end

  test "someone who left the map is not e-mailed any more" do
    CommentSubscription.subscribe(@alice, @feature)
    @map.memberships.find_by(user: @alice).destroy!
    assert_empty notifications { Comment.create!(commentable: @feature, author: @owner, body: "Pour @Alice") }
  end

  test "team members are e-mailed too" do
    team = Organization.create!(name: "Semisto")
    designer = make_user("Dora")
    team.memberships.create!(user: designer, role: "designer")
    @map.update!(organization: team)
    mails = notifications { Comment.create!(commentable: @feature, author: @owner, body: "Salut @Dora") }
    assert_equal [ designer.email_address ], mails.map { |m| m.to.first }
  end

  test "editing a comment only notifies newly mentioned people" do
    comment = nil
    notifications { comment = Comment.create!(commentable: @feature, author: @owner, body: "Salut @Alice") }

    mails = notifications { comment.update!(body: "Salut @Alice et @Edith") }
    assert_equal [ @edith.email_address ], mails.map { |m| m.to.first }

    assert_empty notifications { comment.update!(body: "Salut @Alice et @Edith, merci") }
  end

  test "a comment deleted before the job runs is not announced" do
    CommentSubscription.subscribe(@alice, @feature)
    comment = Comment.create!(commentable: @feature, author: @owner, body: "Oups")
    comment.soft_delete!
    assert_empty notifications { perform_enqueued_jobs }
  end

  test "the notifier reports who it mailed" do
    comment = Comment.create!(commentable: @feature, author: @owner, body: "Pour @Alice")
    assert_equal [ @alice ], Collab::CommentNotifier.new(comment).deliver
  end
end

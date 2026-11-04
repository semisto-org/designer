require "test_helper"
require_relative "../../test_helpers/collab_test_helper"

# Where a message of a map's discussion reaches each member (Michael,
# 2026-11-04): the bell, the phone and e-mail, by their level on the map and
# their switches in « Mon compte ».
class Collab::ChatNotificationsTest < ActiveJob::TestCase
  include ActionCable::TestHelper
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @chris = add_member(@map, make_user("Chris"), "editor")
    @edith = add_member(@map, make_user("Edith"), "editor")
    clear_enqueued_jobs
  end

  def say(body, by: @chris) = Comment.create!(commentable: @map, author: by, body:)

  test "a message rings at once for every member but its author" do
    comment = say "Je trouve l'offre super"
    reached = Collab::ChatAlert.new(comment).deliver
    assert_equal [ @owner, @edith ].map(&:id).sort, reached.map(&:id).sort
    assert_broadcast_on(NotificationsChannel.broadcasting_for(@owner), { type: "chat", mapId: @map.id, commentId: comment.id, mention: false })
  end

  test "levels: mentions only, nothing at all" do
    CommentSubscription.set_chat_level(@owner, @map, "mentions")
    CommentSubscription.set_chat_level(@edith, @map, "none")
    assert_equal [], Collab::ChatAlert.new(say("Bonjour")).recipients

    mention = say("@Michael regarde, @Edith aussi")
    assert_equal [ @owner ], Collab::ChatAlert.new(mention).recipients

    mails = capture_emails { perform_enqueued_jobs(only: ActionMailer::MailDeliveryJob) { Collab::CommentNotifier.new(mention).deliver } }
    assert_equal [ @owner.email_address ], mails.flat_map(&:to), "« Rien » silences a mention e-mail too"
  end

  test "the level falls back on the audience, and reads back as chosen" do
    assert_equal "all", CommentSubscription.chat_level(@edith, @map)
    CommentSubscription.set_chat_level(@edith, @map, "mentions")
    assert_equal "mentions", CommentSubscription.chat_level(@edith, @map)
    assert_not CommentSubscription.subscribed?(@edith, @map), "no digest for mentions only"
    CommentSubscription.set_chat_level(@edith, @map, "none")
    assert_equal "none", CommentSubscription.chat_level(@edith, @map)
    CommentSubscription.mute(@edith, @map, false)
    assert_equal "all", CommentSubscription.chat_level(@edith, @map), "the old bell still works"
    assert_raises(ArgumentError) { CommentSubscription.set_chat_level(@edith, @map, "loud") }
  end

  test "switches: no bell broadcast nor phone when turned off" do
    @owner.update!(chat_notify_app: false)
    PushDevice.register!(@edith, token: "ExponentPushToken[edith]", platform: "ios")
    @edith.update!(chat_notify_push: true)
    comment = say "Hello"
    assert_no_broadcasts(NotificationsChannel.broadcasting_for(@owner)) do
      assert_enqueued_with(job: ChatPushJob, args: [ comment, [ @owner.id, @edith.id ].sort ]) do
        Collab::ChatAlert.new(comment).deliver
      end
    end
  end

  test "a phone gets the message, not if it was read meanwhile; dead tokens are dropped" do
    PushDevice.register!(@owner, token: "ExponentPushToken[michael]", platform: "ios")
    PushDevice.register!(@edith, token: "ExponentPushToken[edith]", platform: "android")
    comment = say "La haie est plantée @Michael"
    travel 1.second
    CommentRead.mark!(@edith, @map)

    request = stub_request(:post, Providers::ExpoPush::URL).with { |req|
      sent = JSON.parse(req.body)
      sent.size == 1 && sent.first["to"] == "ExponentPushToken[michael]" &&
        sent.first["title"] == @map.name && sent.first["body"].start_with?("Chris t'a mentionné") &&
        sent.first["data"] == { "type" => "chat", "mapId" => @map.id, "commentId" => comment.id }
    }.to_return(status: 200, body: { data: [ { status: "error", details: { error: "DeviceNotRegistered" } } ] }.to_json)

    assert_equal [ @owner.id ], Collab::ChatPush.new(comment, [ @owner.id, @edith.id ]).deliver
    assert_requested request
    assert_not PushDevice.exists?(token: "ExponentPushToken[michael]")
  end

  test "Expo down never fails the message" do
    PushDevice.register!(@owner, token: "ExponentPushToken[michael]")
    stub_request(:post, Providers::ExpoPush::URL).to_timeout
    assert_equal [], Collab::ChatPush.new(say("Hello"), [ @owner.id ]).deliver
  end

  test "the inbox counts unread messages per map by level, newest first" do
    freeze_time
    say "Un"
    say "@Michael deux"
    inbox = Collab::ChatInbox.new(@owner)
    item = inbox.items.sole
    assert_equal [ @map.id, 2, 1 ], [ item.map.id, item.unread, item.mentions ]
    assert_equal 2, inbox.total
    json = inbox.as_json
    assert_equal "/maps/#{@map.id}?discussion=Map:#{@map.id}", json[:items].first[:url]
    assert_equal "Chris", json[:items].first[:last][:author]

    CommentSubscription.set_chat_level(@owner, @map, "mentions")
    assert_equal 1, Collab::ChatInbox.new(@owner).total
    CommentSubscription.set_chat_level(@owner, @map, "none")
    assert_equal 0, Collab::ChatInbox.new(@owner).total

    CommentSubscription.set_chat_level(@owner, @map, "all")
    travel 1.minute
    CommentRead.mark!(@owner, @map)
    assert_empty Collab::ChatInbox.new(@owner).items, "read"

    travel 1.minute
    say "Trois"
    inbox = Collab::ChatInbox.new(@owner)
    inbox.mark_all_read!
    assert_empty Collab::ChatInbox.new(@owner).items
    assert_empty Collab::ChatInbox.new(users(:alice)).items, "a viewer outside the discussion"
  end
end

require "test_helper"
require_relative "../test_helpers/collab_test_helper"
require_relative "../test_helpers/teams_test_helper"
require_relative "../test_helpers/billing_test_helper"

class MapTransferTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper
  include BillingTestHelper

  setup do
    @map = maps(:ahinvaux) # owner: michael, viewer: alice
    @owner = users(:michael)
    @viewer = users(:alice)
    @lea = add_member(@map, make_user("Léa"), "editor")
  end

  def propose(to: @lea, from: @owner, map: @map)
    MapTransfer.propose!(map:, from:, to:)
  end

  test "the owner proposes the map to an editor: pending for 14 days, the recipient is mailed" do
    transfer = nil
    assert_enqueued_emails(1) { transfer = propose }
    assert_enqueued_email_with MapTransferMailer, :proposed, args: [ transfer ]
    assert transfer.pending?
    assert_equal "pending", transfer.state
    assert_in_delta 14.days.from_now, transfer.expires_at, 5.seconds
    assert_equal [ transfer ], @map.transfers.pending.to_a
    assert_equal @owner, @map.reload.owner, "nothing changes before the answer"
  end

  test "only the owner proposes, and only to an editor of the map" do
    error = assert_raises(ActiveRecord::RecordInvalid) { propose(from: @lea, to: @viewer) }
    assert error.record.errors.of_kind?(:base, :not_owner)

    error = assert_raises(ActiveRecord::RecordInvalid) { propose(to: @viewer) }
    assert error.record.errors.of_kind?(:base, :not_editor)
    assert_match(/Alice doit d'abord être éditeur de la carte/, error.record.errors.full_messages.to_sentence)

    error = assert_raises(ActiveRecord::RecordInvalid) { propose(to: make_user("Inconnu")) }
    assert error.record.errors.of_kind?(:base, :not_editor)

    error = assert_raises(ActiveRecord::RecordInvalid) { propose(to: @owner) }
    assert error.record.errors.of_kind?(:base, :self)
    assert_no_enqueued_emails
  end

  test "an archived map cannot be transferred" do
    @map.update!(archived_at: Time.current)
    error = assert_raises(ActiveRecord::RecordInvalid) { propose }
    assert error.record.errors.of_kind?(:base, :archived)
  end

  test "one pending proposal per map, enforced by the database too" do
    first = propose
    other = add_member(@map, make_user("Paul"), "editor")
    error = assert_raises(ActiveRecord::RecordInvalid) { propose(to: other) }
    assert error.record.errors.of_kind?(:base, :already_pending)

    assert_raises(ActiveRecord::RecordNotUnique) do
      MapTransfer.new(map: @map, from_user: @owner, to_user: other, expires_at: 1.day.from_now).save!(validate: false)
    end

    first.cancel!(by: @owner)
    assert propose(to: other).pending?, "a canceled proposal frees the map"
  end

  test "a proposal expires after 14 days and stops blocking a new one" do
    transfer = propose
    travel 15.days do
      assert_equal "expired", transfer.reload.state
      assert_not transfer.pending?
      assert_empty @map.transfers.pending
      error = assert_raises(MapTransfer::Refused) { transfer.accept!(by: @lea) }
      assert_equal :expired, error.reason
      assert_equal @owner, @map.reload.owner

      renewed = propose
      assert renewed.pending?
      assert_equal "expired", transfer.reload.status
    end
  end

  test "acceptance swaps owner and editor and keeps everything else" do
    team = make_team(admin: @owner)
    @map.update!(organization: team)
    publication = MapPublication.publish!(@map, by: @owner, title: "Le projet")
    comment = @map.comments.create!(author: @owner, body: "Bienvenue")
    feature = with_feature(@map)
    add_member(@map, make_user("Paul"), "editor")
    add_member(@map, make_user("Zoé"), "editor")
    assert_equal 3, @map.editors_count
    lock_version = @map.reload.lock_version

    transfer = propose
    assert_enqueued_email_with MapTransferMailer, :accepted, args: [ transfer ] do
      transfer.accept!(by: @lea)
    end

    @map.reload
    assert_equal "accepted", transfer.reload.status
    assert transfer.closed_at.present?
    assert_equal @lea, @map.owner
    assert_equal "owner", @map.role_for(@lea)
    assert_equal "owner", @map.memberships.find_by(user: @lea).role
    assert_equal "editor", @map.role_for(@owner)
    assert_equal "editor", @map.memberships.find_by(user: @owner).role
    assert_equal 3, @map.editors_count, "the former owner takes the recipient's seat"
    assert_equal "viewer", @map.role_for(@viewer)
    assert_equal team, @map.organization
    assert publication.reload.live?
    assert comment.reload.persisted?
    assert feature.reload.persisted?
    assert_equal lock_version, @map.lock_version, "a sharing change, not an edit"
    assert_includes @lea.owned_maps, @map
    assert_not_includes @owner.owned_maps, @map
  end

  test "after acceptance the map follows the new owner's plan" do
    with_billing do
      @owner.plan_purchases.create!(plan_key: "yearly", starts_at: 1.day.ago, expires_at: 1.year.from_now, stripe_checkout_session_id: "cs_owner")
      Map.create!(name: "Plus ancienne", owner: @lea, region: regions(:wallonia), created_at: 1.year.ago)
      assert Entitlements.for_map(@map).pdf_export?
      assert_not @map.read_only_by_plan?

      propose.accept!(by: @lea)
      @map.reload
      assert_equal "free", Entitlements.for_map(@map).plan
      assert_not Entitlements.for_map(@map).pdf_export?
      assert @map.read_only_by_plan?, "Léa's free plan covers her older map only"
    end
  end

  test "only the recipient answers" do
    transfer = propose
    error = assert_raises(MapTransfer::Refused) { transfer.accept!(by: @owner) }
    assert_equal :not_recipient, error.reason
    assert_raises(MapTransfer::Refused) { transfer.decline!(by: @viewer) }
    assert transfer.reload.pending?
    assert_equal @owner, @map.reload.owner
  end

  test "acceptance is refused cleanly when the recipient is no longer an editor" do
    transfer = propose
    @map.memberships.find_by(user: @lea).update!(role: "viewer")

    error = nil
    assert_no_enqueued_emails { error = assert_raises(MapTransfer::Refused) { transfer.accept!(by: @lea) } }
    assert_equal :not_editor, error.reason
    assert_match(/plus éditeur/, error.message)
    assert_equal "invalidated", transfer.reload.status
    assert_equal @owner, @map.reload.owner
    assert_equal "owner", @map.memberships.find_by(user: @owner).role
  end

  test "acceptance is refused cleanly when the proposer is no longer the owner" do
    transfer = propose
    other = make_user("Autre")
    @map.update_columns(owner_id: other.id)

    error = assert_raises(MapTransfer::Refused) { transfer.accept!(by: @lea) }
    assert_equal :owner_changed, error.reason
    assert_equal "invalidated", transfer.reload.status
    assert_equal other, @map.reload.owner
  end

  test "a recipient who left the map no longer blocks a new proposal" do
    transfer = propose
    @map.memberships.find_by(user: @lea).destroy!
    paul = add_member(@map, make_user("Paul"), "editor")
    assert propose(to: paul).pending?
    assert_equal "invalidated", transfer.reload.status
  end

  test "the recipient declines: nothing changes, the owner is mailed" do
    transfer = propose
    assert_enqueued_email_with MapTransferMailer, :declined, args: [ transfer ] do
      transfer.decline!(by: @lea)
    end
    assert_equal "declined", transfer.reload.state
    assert_equal @owner, @map.reload.owner
    assert_equal "editor", @map.role_for(@lea)
    error = assert_raises(MapTransfer::Refused) { transfer.accept!(by: @lea) }
    assert_equal :declined, error.reason
  end

  test "the owner cancels a pending proposal, nobody else can" do
    transfer = propose
    error = assert_raises(MapTransfer::Refused) { transfer.cancel!(by: @lea) }
    assert_equal :not_owner, error.reason

    transfer.cancel!(by: @owner)
    assert_equal "canceled", transfer.reload.state
    error = assert_raises(MapTransfer::Refused) { transfer.accept!(by: @lea) }
    assert_equal :canceled, error.reason
    assert_match(/Michael a annulé/, error.message)
  end

  test "a team member without a seat can receive the map when a seat is free for the former owner" do
    bob = users(:bob)
    team = make_team(admin: @owner, members: [ bob ])
    @map.update!(organization: team)
    assert_equal "editor", @map.role_for(bob)

    transfer = propose(to: bob)
    assert transfer.seat_needed?
    transfer.accept!(by: bob)

    @map.reload
    assert_equal bob, @map.owner
    assert_equal "owner", @map.memberships.find_by(user: bob).role
    assert_equal "editor", @map.memberships.find_by(user: @owner).role
    assert_equal 2, @map.editors_count
  end

  test "a team member cannot receive the map when the three seats are taken" do
    bob = users(:bob)
    @map.update!(organization: make_team(admin: @owner, members: [ bob ]))
    add_member(@map, make_user("Paul"), "editor")
    add_member(@map, make_user("Zoé"), "editor")

    error = assert_raises(ActiveRecord::RecordInvalid) { propose(to: bob) }
    assert error.record.errors.of_kind?(:base, :no_seat)

    # Proposed while a seat was free, the seat taken meanwhile: refused, kept pending.
    @map.memberships.find_by(user: @lea).destroy!
    transfer = propose(to: bob)
    add_member(@map, make_user("Max"), "editor")
    error = assert_raises(MapTransfer::Refused) { transfer.accept!(by: bob) }
    assert_equal :no_seat, error.reason
    assert transfer.reload.pending?
    assert_equal @owner, @map.reload.owner
  end

  test "incoming proposals for a user, on active maps only" do
    transfer = propose
    assert_equal [ transfer ], MapTransfer.incoming_for(@lea).to_a
    assert_empty MapTransfer.incoming_for(@owner)
    json = transfer.as_incoming_json
    assert_equal({ id: transfer.id, mapId: @map.id, mapName: @map.name, fromName: "Michael", expiresAt: transfer.expires_at.iso8601 }, json)

    @map.update!(archived_at: Time.current)
    assert_empty MapTransfer.incoming_for(@lea)
  end

  test "deleting a user takes their proposals along (database cascade)" do
    propose
    assert_difference -> { MapTransfer.count }, -1 do
      @lea.destroy!
    end
  end
end

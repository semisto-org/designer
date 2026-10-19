require "test_helper"
require_relative "../test_helpers/collab_test_helper"
require_relative "../test_helpers/propagation_test_helper"

class PropagationRequestTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper

  setup do
    @map = share_place!
    @apple = plant_species(:apple)
    @reinette = plant_varieties(:reinette)
    plant_in_ground!(@map, @apple, variety: @reinette)
    @bob = gardener_with_map
  end

  def ask(**attrs)
    PropagationRequest.new({ map: @map, species: @apple, variety: @reinette, requester: @bob, material: "scions", message: "Bonjour, je cherche des greffons." }.merge(attrs))
  end

  test "a gardener asks a place that shows the plant and accepts requests; its owners get an e-mail" do
    assert_enqueued_emails 1 do
      assert ask.save
    end
  end

  test "a place that does not accept requests, or no longer shows its plants, cannot be asked" do
    @map.update!(accepts_propagation_requests: false)
    assert_includes ask.tap(&:validate).errors.details[:base].map { _1[:error] }, :closed

    @map.update!(accepts_propagation_requests: true, shares_planted_palette: false)
    assert_not @map.reload.accepts_propagation_requests, "asking needs the plants to be shown"
    assert_not ask.valid?
  end

  test "only a plant really in the ground there can be asked" do
    assert_includes ask(variety: plant_varieties(:boskoop)).tap(&:validate).errors.details[:base].map { _1[:error] }, :not_in_ground
    plant_in_ground!(@map, plant_species(:alder), planted_on: nil, planned: true)
    assert_not ask(species: plant_species(:alder), variety: nil).valid?
    assert ask(variety: nil).valid?, "the species without a cultivar is in the ground"
  end

  test "someone who already opens the map, a second pending request for the same plant and a blank message are refused" do
    assert_includes ask(requester: users(:alice)).tap(&:validate).errors.details[:base].map { _1[:error] }, :own_place
    ask.save!
    assert_includes ask.tap(&:validate).errors.details[:base].map { _1[:error] }, :already_asked
    assert_not ask(message: "  ", variety: nil).valid?
  end

  test "an owner of the place accepts: the requester learns it by e-mail; anyone else cannot answer" do
    request = ask.tap(&:save!)
    assert_not request.answerable_by?(users(:alice))
    assert request.answerable_by?(users(:michael))

    assert_enqueued_emails 1 do
      request.accept!(users(:michael), answer: "Passe en février.")
    end
    assert request.reload.accepted?
    assert_equal users(:michael), request.answered_by
    assert_not request.answerable_by?(users(:michael)), "answered once"
  end

  test "the place's sharing ends with its last owner" do
    membership = @map.memberships.find_by(user: users(:michael))
    membership.update!(place_owner: false)
    assert_not @map.reload.shares_planted_palette
    assert_not @map.accepts_propagation_requests
  end
end

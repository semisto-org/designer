require "test_helper"
require_relative "../test_helpers/collab_test_helper"
require_relative "../test_helpers/propagation_test_helper"

class PropagationRequestMailerTest < ActionMailer::TestCase
  setup do
    map = share_place!
    plant_in_ground!(map, plant_species(:apple), variety: plant_varieties(:reinette))
    @request = PropagationRequest.create!(map:, species: plant_species(:apple), variety: plant_varieties(:reinette), requester: gardener_with_map,
                                          material: "scions", message: "Je cherche cette reinette depuis longtemps.")
  end

  test "the owner learns who asks and what, never the requester's address" do
    mail = PropagationRequestMailer.with(request: @request, owner: users(:michael)).received
    assert_equal [ users(:michael).email_address ], mail.to
    assert_includes mail.subject, "Bob"
    assert_includes mail.text_part.body.to_s, "Je cherche cette reinette"
    assert_includes mail.text_part.body.to_s, "greffons"
    assert_not_includes mail.text_part.body.to_s, users(:bob).email_address
    assert mail.attachments["lieu.png"], "the owner sees their own place"
  end

  test "on acceptance the requester gets the owner's address and can reply to them" do
    @request.update!(status: "accepted", answered_by: users(:michael), answer: "Viens en février.", answered_at: Time.current)
    mail = PropagationRequestMailer.with(request: @request).accepted
    assert_equal [ users(:bob).email_address ], mail.to
    assert_equal [ users(:michael).email_address ], mail.reply_to
    assert_includes mail.html_part.body.to_s, "Viens en février."
    assert_includes mail.text_part.body.to_s, users(:michael).email_address
    assert_empty mail.attachments, "the requester never sees the place"
    assert_not_includes mail.text_part.body.to_s, @request.map.name
  end

  test "a declined request is told politely" do
    mail = PropagationRequestMailer.with(request: @request).declined
    assert_equal [ users(:bob).email_address ], mail.to
    assert_includes mail.text_part.body.to_s, "D'autres jardins"
  end
end

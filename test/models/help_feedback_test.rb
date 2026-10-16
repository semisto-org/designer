require "test_helper"

class HelpFeedbackTest < ActiveSupport::TestCase
  test "an answer needs an existing guide and a yes or no" do
    assert HelpFeedback.new(slug: "formules-et-forfait", helpful: true).valid?
    assert_not HelpFeedback.new(slug: "inconnu", helpful: true).valid?
    assert_not HelpFeedback.new(slug: "formules-et-forfait", helpful: nil).valid?
    assert_not HelpFeedback.new(slug: "formules-et-forfait", helpful: false, comment: "x" * 1001).valid?
  end

  test "tally counts yes and no per guide" do
    2.times { HelpFeedback.create!(slug: "formules-et-forfait", helpful: true) }
    HelpFeedback.create!(slug: "formules-et-forfait", helpful: false)
    tally = HelpFeedback.tally
    assert_equal({ helpful: 2, unhelpful: 1 }, tally["formules-et-forfait"])
    assert_equal({ helpful: 0, unhelpful: 0 }, tally["payer-sur-facture"])
  end
end

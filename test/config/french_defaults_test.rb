require "test_helper"

class FrenchDefaultsTest < ActiveSupport::TestCase
  test "lists read in French" do
    I18n.with_locale(:fr) do
      assert_equal "arbustive et couvre-sol", %w[arbustive couvre-sol].to_sentence
      assert_equal "a, b et c", %w[a b c].to_sentence
    end
  end

  test "dates are localized in French" do
    I18n.with_locale(:fr) do
      assert_equal "4 octobre 2026", I18n.l(Date.new(2026, 10, 4), format: :long)
      assert_equal "04/10/2026", I18n.l(Date.new(2026, 10, 4))
    end
  end
end

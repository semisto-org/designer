require "test_helper"

class Billing::VatNumberTest < ActiveSupport::TestCase
  test "a Belgian BCE number without its country becomes a BE VAT number, after its check digits" do
    assert_equal "BE0790631657", Billing::VatNumber.normalize("0790.631.657")
    assert_equal "BE0790631657", Billing::VatNumber.normalize("790 631 657")
    assert_equal "BE0790631657", Billing::VatNumber.normalize("be 0790.631.657")
    assert_nil Billing::VatNumber.normalize("0790.631.658")
  end

  test "other EU numbers keep their country; anything else is refused" do
    assert_equal "FR40303265045", Billing::VatNumber.normalize("FR 40 303 265 045")
    assert_nil Billing::VatNumber.normalize("hello")
    assert_nil Billing::VatNumber.normalize("")
  end
end

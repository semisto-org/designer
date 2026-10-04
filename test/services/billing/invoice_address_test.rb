require "test_helper"

class Billing::InvoiceAddressTest < ActiveSupport::TestCase
  def parse(text, **options) = Billing::InvoiceAddress.parse(text, **options)

  test "a Belgian address as a commune writes it" do
    assert_equal({ line1: "Rue de l'Hôtel de Ville 1", postal_code: "5530", city: "Yvoir", country: "BE" },
      parse("Administration communale de Yvoir\nRue de l'Hôtel de Ville 1\n5530 Yvoir\nBelgique", organization_name: "Administration communale de Yvoir"))
  end

  test "extra lines go to line2, a country line or a postal prefix sets the country" do
    assert_equal({ line1: "Service des finances", line2: "Place 2, Bâtiment B", postal_code: "59000", city: "Lille", country: "FR" },
      parse("Service des finances\nPlace 2\nBâtiment B\n59000 Lille\nFRANCE"))
    assert_equal "BE", parse("Rue X 3\nB-1000 Bruxelles")[:country]
    assert_equal "LU", parse("Rue X 3\nL-1111 Luxembourg")[:country]
    assert_equal({ line1: "Straat 1", postal_code: "1234 AB", city: "Amsterdam", country: "NL" }, parse("Straat 1\n1234 AB Amsterdam\nNederland"))
  end

  test "without a country line: the VAT number's country, else Belgium" do
    assert_equal "DE", parse("Straße 1\n10115 Berlin", company_number: "DE123456789")[:country]
    assert_equal "GR", parse("Odos 1\n10431 Athina", company_number: "EL123456789")[:country]
    assert_equal "BE", parse("Rue 1\n5000 Namur", company_number: "0207.360.311")[:country]
  end

  test "an address without postal code keeps its lines" do
    assert_equal({ line1: "Chemin des Saules", line2: "Ferme du Bois", country: "BE" }, parse("Chemin des Saules\nFerme du Bois"))
  end

  test "recognises EU VAT numbers, whatever the spacing" do
    assert_equal "BE0207360311", Billing::InvoiceAddress.eu_vat("BE 0207.360.311")
    assert_equal "BE1234567890", Billing::InvoiceAddress.eu_vat("be1234567890")
    assert_equal "FR12345678901", Billing::InvoiceAddress.eu_vat("FR 12 345678901")
    assert_nil Billing::InvoiceAddress.eu_vat("0207.360.311")      # BCE number without the BE prefix
    assert_nil Billing::InvoiceAddress.eu_vat("BE207360311")       # too short
    assert_nil Billing::InvoiceAddress.eu_vat("US12-3456789")
    assert_nil Billing::InvoiceAddress.eu_vat(nil)
  end
end

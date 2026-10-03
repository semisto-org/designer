require "test_helper"

class FinancialPlan::ExportTest < ActiveSupport::TestCase
  setup do
    @plan = FinancialPlan.create!(map: maps(:ahinvaux), inputs: {
      "settings" => { "start_year" => 2027, "labour_cost_per_hour" => 15 },
      "species" => [ { "name" => "Pommier", "quantity" => 100, "unit_price" => 10, "first_harvest_age" => 3, "full_production_age" => 5,
                       "yield_kg_per_plant" => 10, "picking_rate_kg_per_hour" => 20, "direct_share_pct" => 100, "direct_price" => 4.5 } ],
      "investments" => [ { "label" => "Clôture", "category" => "fencing", "amount" => 1234.5 } ],
      "loans" => [ { "label" => "Prêt", "amount" => 5000, "rate_pct" => 3, "years" => 5 } ]
    })
    @export = FinancialPlan::Export.new(@plan)
  end

  test "CSV for Belgian spreadsheets: BOM, semicolons, decimal commas, costs negative" do
    csv = @export.to_csv
    assert csv.start_with?("﻿")
    rows = CSV.parse(csv.delete_prefix("﻿"), col_sep: ";")
    assert_includes rows.first.first, "Domaine d'Ahinvaux"
    header = rows.find { _1.first == "Poste" }
    assert_equal 21, header.size
    assert_equal "Année 1 (2027)", header[1]
    investments = rows.find { _1.first == "Investissements" }
    assert_equal "-2234,50", investments[1]
    sales = rows.find { _1.first == "Ventes de récolte" }
    assert_equal "4500,00", sales[5]
    assert rows.any? { _1.first == "Heures de cueillette" }
  end

  test "XLSX workbook with the five sheets" do
    data = @export.to_xlsx
    assert data.start_with?("PK"), "an OOXML zip"
    entries = workbook = cells = nil
    Zip::File.open_buffer(StringIO.new(data)) do |zip|
      entries = zip.map(&:name)
      workbook = zip.read("xl/workbook.xml").force_encoding("UTF-8")
      cells = entries.grep(%r{\Axl/(worksheets/sheet|sharedStrings)}).map { zip.read(_1).force_encoding("UTF-8") }.join
    end
    assert_equal 5, entries.count { _1.start_with?("xl/worksheets/sheet") }
    [ "Synthèse", "Compte de résultat", "Trésorerie", "Récoltes", "Hypothèses" ].each { assert_includes workbook, _1 }
    # Assumption columns keep their unit in the sheet.
    assert_includes cells, "Récolte par plant adulte (kg/an)"
  end

  test "file names" do
    assert_equal "plan-financier-domaine-d-ahinvaux.xlsx", @export.filename("xlsx")
  end
end

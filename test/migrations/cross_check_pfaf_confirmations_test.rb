require "test_helper"
require Rails.root.join("db/migrate/20261102190100_cross_check_pfaf_confirmations")

class CrossCheckPfafConfirmationsTest < ActiveSupport::TestCase
  test "a value PFAF only confirmed goes back to the species' own source, marked « recoupée avec PFAF »" do
    species = PlantSpecies.create!(latin_name: "Salvia nemorosa", review_status: "reviewed")
    Catalog::SpeciesWriter.new(source: "user", status: "to_verify").write(species, { "strata" => "herbaceous", "foliage_type" => "deciduous", "height_max_m" => 0.6, "life_cycle" => "perennial" })
    # What the review did before: PFAF's confirmation made foliage sourced
    # from PFAF; the height is PFAF's own value, taken by the reviewer.
    species.record_provenance!("foliage_type", source: "pfaf", url: "https://pfaf.org/x", status: "sourced", license: "PFAF, usage non commercial")
    species.record_provenance!("height_max_m", source: "pfaf", status: "sourced")
    species.record_provenance!("life_cycle", source: "wikipedia", status: "sourced")
    species.value_checks.create!(field: "foliage_type", verdict: "confirmed", source: "pfaf")
    species.value_checks.create!(field: "height_max_m", verdict: "contradicted", source: "pfaf", source_value: 0.6)
    species.value_checks.create!(field: "life_cycle", verdict: "confirmed", source: "wikipedia")

    CrossCheckPfafConfirmations.new.up
    species.reload

    assert_equal [ "user", "to_verify", "pfaf", nil, nil ],
                 species.provenance_for("foliage_type").values_at(:source, :status, :cross_checked_with, :license, :url)
    assert_equal [ "pfaf", "sourced", nil ], species.provenance_for("height_max_m").values_at(:source, :status, :cross_checked_with),
                 "a value PFAF gave keeps citing it"
    assert_equal [ "wikipedia", "sourced" ], species.provenance_for("life_cycle").values_at(:source, :status)
  end
end

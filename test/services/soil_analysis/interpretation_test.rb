require "test_helper"

class SoilAnalysis::InterpretationTest < ActiveSupport::TestCase
  I = SoilAnalysis::Interpretation

  test "bands: below the limit is low, above is high, between (limits included) is ok" do
    assert_equal "low", I.band("ph_water", 5.4)
    assert_equal "ok", I.band("ph_water", 5.5)
    assert_equal "ok", I.band("ph_water", 7.5)
    assert_equal "high", I.band("ph_water", 7.6)
    assert_equal "low", I.band("organic_matter_pct", 1.2)
    assert_equal "high", I.band("c_n_ratio", 15)
  end

  test "no band for the texture fractions, unknown keys or missing values" do
    assert_nil I.band("sand_pct", 40)
    assert_nil I.band("unknown", 3)
    assert_nil I.band("ph_water", nil)
  end

  test "every banded parameter has a French explanation for each band" do
    I::BANDED.each do |key|
      I::BANDS.each do |band|
        text = I18n.t("soil.interpretation.#{key}.#{band}")
        assert_not_includes text, "translation missing", "#{key}.#{band}"
        assert_operator text.length, :>, 15
      end
      assert_not_includes I18n.t("soil.fields.#{key}.name"), "translation missing"
    end
    assert_equal 3, I::BANDS.size
  end

  test "reads a sample: parameters in order, bands, explanations and the texture class" do
    sample = SoilSample.new(map: maps(:ahinvaux), label: "Verger", results: {
      "ph_water" => "5,1", "organic_matter_pct" => 3.2, "c_n_ratio" => 15,
      "sand_pct" => 20, "silt_pct" => 65, "clay_pct" => 15
    })
    reading = I.for(sample)
    assert_equal %w[ph_water organic_matter_pct c_n_ratio], reading[:parameters].map { |p| p[:key] }
    assert_equal %w[low ok high], reading[:parameters].map { |p| p[:band] }
    assert_match(/Sol acide/, reading[:parameters].first[:explanation])
    assert_equal "silt_loam", reading[:texture][:key]
    assert_equal "Limon", reading[:texture][:name]
    assert_equal "semisto, à vérifier", reading[:provenance]
  end

  test "a sample without results has nothing to read" do
    reading = I.for(SoilSample.new(map: maps(:ahinvaux), label: "Vide"))
    assert_empty reading[:parameters]
    assert_nil reading[:texture]
  end
end

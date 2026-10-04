require "test_helper"

class SoilAnalysis::BioindicatorCatalogTest < ActiveSupport::TestCase
  C = SoilAnalysis::BioindicatorCatalog

  test "a curated list of about thirty plants, each with its provenance" do
    assert_operator C.all.size, :>=, 30
    C.all.each do |plant|
      assert plant["key"].present? && plant["name"].present? && plant["latin"].present? && plant["note"].present?, plant["key"]
      assert_equal "semisto, à vérifier", plant["provenance"], plant["key"]
      assert plant["indicates"].present?, plant["key"]
      assert_empty plant["indicates"] - C::INDICATORS, "unknown indicator for #{plant["key"]}"
    end
    assert_equal C.all.size, C.keys.uniq.size
  end

  test "every indicator has a French label and a hint" do
    C::INDICATORS.each do |key|
      assert_not_includes I18n.t("soil.indicators.#{key}.label"), "translation missing", key
      assert_not_includes I18n.t("soil.indicators.#{key}.hint"), "translation missing", key
    end
  end

  test "every indicator is used by at least one plant" do
    used = C.all.flat_map { |plant| plant["indicates"] }.uniq
    assert_empty C::INDICATORS - used
  end

  test "search ignores case and accents, in French and Latin names" do
    assert_includes C.search("pissen").map { |p| p["key"] }, "pissenlit"
    assert_includes C.search("PRELE").map { |p| p["key"] }, "prele_des_champs"
    assert_includes C.search("urtica").map { |p| p["key"] }, "ortie"
    assert_includes C.search("égopode").map { |p| p["key"] }, "egopode"
    assert_empty C.search("zzzz")
    assert_equal 10, C.search("").size
  end

  test "tally weighs what the observations point to by abundance" do
    obs = [
      BioindicatorObservation.new(catalog_key: "plantain_majeur", species_name: "Plantain majeur", abundance: "dominant"),
      BioindicatorObservation.new(catalog_key: "renouee_oiseaux", species_name: "Renouée des oiseaux", abundance: "rare"),
      BioindicatorObservation.new(catalog_key: "ortie", species_name: "Ortie dioïque", abundance: "present")
    ]
    tally = C.tally(obs)
    assert_equal "compaction", tally.first[:key]
    assert_equal 5, tally.first[:score] # dominant 4 + rare 1
    assert_equal [ "Plantain majeur", "Renouée des oiseaux" ], tally.first[:plants]
    assert_includes tally.map { |row| row[:key] }, "nitrogen_rich"
  end
end

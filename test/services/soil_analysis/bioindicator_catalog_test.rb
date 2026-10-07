require "test_helper"

class SoilAnalysis::BioindicatorCatalogTest < ActiveSupport::TestCase
  C = SoilAnalysis::BioindicatorCatalog

  test "a curated list of about thirty plants, each claim with its evidence" do
    assert_operator C.all.size, :>=, 30
    C.all.each do |plant|
      assert plant["key"].present? && plant["name"].present? && plant["latin"].present? && plant["note"].present?, plant["key"]
      assert_includes plant["provenance"], "EIVE", plant["key"]
      assert_empty plant["indicates"] - C::INDICATORS, "unknown indicator for #{plant["key"]}"
      plant["indicates"].each do |key|
        evidence = plant["evidence"][key]
        assert_includes %w[sourced to_verify], evidence["status"], "#{plant["key"]}.#{key}"
        assert evidence["detail"].present?, "#{plant["key"]}.#{key}"
        assert evidence["sources"].present?, "#{plant["key"]}.#{key}"
      end
      assert_equal plant["indicates"].select { |key| plant["evidence"][key]["status"] == "to_verify" }, plant["unverified"]
      assert_nil plant["values"], "raw figures stay in the file"
    end
    assert_equal C.all.size, C.keys.uniq.size
  end

  test "a sourced claim cites an open dataset, a claim from the permaculture literature stays to verify" do
    open_data = %w[eive ellenberg_1991 midolo_2023 eunis_esy]
    data = YAML.safe_load_file(C::FILE)
    data["plants"].each do |plant|
      plant["evidence"].each do |key, claim|
        if claim["status"] == "sourced"
          assert (claim["refs"] & open_data).any?, "#{plant["key"]}.#{key}"
          assert_not_includes claim["refs"], "ducerf", "#{plant["key"]}.#{key}"
        end
      end
    end
    # Every plant has the raw figures its claims were read from.
    assert data["plants"].all? { |plant| plant.dig("values", "eive", "N").is_a?(Numeric) }
  end

  test "the claims the data contradicted are gone" do
    assert_not_includes C.find("trefle_blanc")["indicates"], "nitrogen_poor"
    assert_not_includes C.find("prele_des_champs")["indicates"], "acidic"
    assert_empty C.find("achillee_millefeuille")["indicates"]
    assert_equal %w[compaction], C.find("pissenlit")["unverified"]
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
    assert tally.first[:unverified], "compaction rests only on claims to verify"
    assert_not tally.find { |row| row[:key] == "trampled" }[:unverified]
  end

  test "find_by_latin matches Pl@ntNet names whatever the authorship or qualifier" do
    assert_equal "ortie", C.find_by_latin("Urtica dioica L.")["key"]
    assert_equal "Taraxacum officinale (groupe)", C.find_by_latin("Taraxacum officinale aggr.")["latin"]
    assert_nil C.find_by_latin("Malus domestica")
    assert_nil C.find_by_latin("Urtica")
    assert_nil C.find_by_latin(nil)
  end
end

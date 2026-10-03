require "test_helper"
require_relative "../../../support/map_data_test_helper"

class Providers::ArcgisIdentify::FormattersTest < ActiveSupport::TestCase
  include MapDataTestHelper

  F = Providers::ArcgisIdentify::Formatters

  def results(name) = JSON.parse(provider_fixture(name))["results"]

  test "sols: sigle, definition, stones, https link only, de-duplicated" do
    entries = F.entries_for("sols", results("identify_sols.json"))
    assert_equal 2, entries.size
    sol = entries.first
    assert_equal "Sol Gbbfi2", sol[:text]
    assert_includes sol[:detail], "Sols limono-caillouteux"
    assert_includes sol[:detail], "Charge caillouteuse en surface : 15 %"
    assert_equal "https://geoapps.wallonie.be/cigale/fiches/CNSW/Gbbfi2.pdf", sol[:href]
    assert_equal "Fiche du type de sol", sol[:href_label]
    built = entries.second
    assert_equal "Sol OB", built[:text]
    assert_nil built[:href], "javascript: links are dropped"
    assert_nil built[:href_label]
  end

  test "cadastre: parcel number, section, division and CAPAKEY" do
    entries = F.entries_for("cadastre", results("identify_cadastre.json"))
    assert_equal [ { text: "Parcelle 247X9, section B", detail: "YVOIR 2 DIV · 92142B0247/00X009", href: nil, href_label: nil } ], entries
  end

  test "parcel_number" do
    assert_equal "247X9", F.parcel_number("Radical" => "0247", "Bis" => "00", "Exposant" => "X", "Puissance" => "009")
    assert_equal "12/2A", F.parcel_number("Radical" => "0012", "Bis" => "02", "Exposant" => "A", "Puissance" => "000")
    assert_equal "5", F.parcel_number("Radical" => "0005", "Exposant" => "Null")
  end

  test "courbes and pentes read raster pixel values" do
    assert_equal "Altitude 187,5 m", F.entries_for("courbes", results("identify_courbes.json")).first[:text]
    pentes = F.entries_for("pentes", [ { "attributes" => { "Stretch.Pixel Value" => "12,4" } } ])
    assert_equal "Pente 12 %", pentes.first[:text]
    assert_empty F.entries_for("pentes", [ { "attributes" => { "Stretch.Pixel Value" => "NoData" } } ])
  end

  test "natura2000: management unit, else site" do
    unit = F.entries_for("natura2000", [ { "attributes" => {
      "CODE_UG" => "UG2", "ET_CODE_UG_FR" => "UG 2", "DESC_UG_FR" => "Milieux ouverts prioritaires", "LIEN_UG" => "https://biodiversite.wallonie.be/ug2"
    } } ]).first
    assert_equal "UG 2 — Milieux ouverts prioritaires", unit[:text]
    assert_equal "Fiche de l'unité de gestion", unit[:href_label]
    site = F.entries_for("natura2000", [ { "attributes" => { "NOM_FR" => "Vallée du Bocq", "CODE_SITE" => "BE35009" } } ]).first
    assert_equal "Site Vallée du Bocq (BE35009)", site[:text]
  end

  test "parcellaire agricole: crop with surface, campaign and organic; landscape element" do
    crop = F.entries_for("parcellaire_agricole", [ { "attributes" => {
      "CULT_NOM" => "Prairie permanente", "DECLARED" => "1.4567", "CAMPAGNE" => "2025", "ORGANIC" => "1"
    } } ]).first
    assert_equal "Prairie permanente", crop[:text]
    assert_equal "1,46 ha déclarés · campagne 2025 · bio", crop[:detail]
    hedge = F.entries_for("parcellaire_agricole", [ { "layerName" => "Haies", "attributes" => { "LANDSCAPE" => "woody" } } ]).first
    assert_equal({ text: "Haies", detail: "Élément ligneux", href: nil, href_label: nil }, hedge)
  end

  test "ruissellement: watercourse names title-cased, else runoff axis" do
    river = F.entries_for("ruissellement", [ { "layerName" => "Cours d'eau", "attributes" => { "NOMA" => "RY-DE-VAUX", "NOMB" => "Le" } } ]).first
    assert_equal "Le Ry-De-Vaux", river[:text]
    axis = F.entries_for("ruissellement", [ { "layerName" => "Axes", "attributes" => { "arcid" => "8812" } } ]).first
    assert_equal "Axe de ruissellement concentré", axis[:text]
  end

  test "essences: one line per known field" do
    entries = F.entries_for("essences", [ { "attributes" => { "Raster.NT_DESC" => "Mésotrophe", "Raster.NH_DESC" => "Frais", "Raster.SS_DESC" => "Null" } } ])
    assert_equal [ "Niveau trophique : Mésotrophe", "Niveau hydrique : Frais" ], entries.pluck(:text)
  end

  test "forêts anciennes and plan de secteur" do
    forest = F.entries_for("forets_anciennes", [ { "attributes" => { "Ancienneté de la forêt actuelle" => "forêt ancienne subnaturelle", "Classification de la forêt actuelle" => "Feuillus" } } ]).first
    assert_equal "Forêt ancienne subnaturelle", forest[:text]
    ferraris = F.entries_for("forets_anciennes", [ { "attributes" => { "Description de l'occupation du sol" => "bois" } } ]).first
    assert_equal "Vers 1777 (carte de Ferraris)", ferraris[:detail]

    zone = F.entries_for("plan_secteur", [ { "attributes" => {
      "Phrase carto juridique" => "zone agricole", "Article CoDT" => "D.II.36", "Lien Wallex " => "https://wallex.wallonie.be/codt"
    } } ]).first
    assert_equal({ text: "Zone agricole", detail: "CoDT D.II.36", href: "https://wallex.wallonie.be/codt", href_label: "Texte sur Wallex" }, zone)
  end

  test "unknown formatter falls back to value or layer name; junk is ignored" do
    entries = F.entries_for("whatever", [ { "value" => "42", "layerName" => "X" }, { "layerName" => "Y" }, "junk", { "attributes" => nil } ])
    assert_equal %w[42 Y], entries.pluck(:text)
  end

  test "texts are cleaned and capped" do
    entry = F.entries_for("whatever", [ { "value" => "a\u0000b   c" + ("x" * 400) } ]).first
    assert entry[:text].start_with?("a b c")
    assert_operator entry[:text].length, :<=, F::MAX_TEXT
  end
end

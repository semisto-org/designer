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

  test "cadastre: the federal CadGIS layer (Brussels) is numbered from its CaPaKey" do
    entries = F.entries_for("cadastre", results("identify_cadastre_brussels.json"))
    assert_equal [ { text: "Parcelle 21S8, section B", detail: "21444B0021/00S008", href: nil, href_label: nil } ], entries
    plain = F.cadastre_entry("CaPaKey" => "21015A0123/00_000")
    assert_equal "Parcelle 123, section A", plain[:text]
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

  test "essences: the numbered level comes with its name, as the Fichier reads it" do
    hydric = F.entries_for("essences", [ { "attributes" => { "Raster.NIVEAUX_HYDRIQUES" => "-2", "Raster.NH_DESC" => "sols humides" } } ])
    trophic = F.entries_for("essences", [ { "attributes" => { "Raster.NIVEAUX_TROPHIQUES" => "0", "Raster.NT_DESC" => "sols mésotrophes" } } ])
    water = F.entries_for("essences", [ { "attributes" => { "Raster.APPORTS_EAU" => "A", "Raster.AE_DESC" => "sans apport d'eau" } } ])
    assert_equal [ "Niveau hydrique : −2 (sols humides)" ], hydric.pluck(:text)
    assert_equal [ "Niveau trophique : 0 (sols mésotrophes)" ], trophic.pluck(:text)
    assert_equal [ "Apports d'eau : sans apport d'eau" ], water.pluck(:text)
  end

  test "zones bioclimatiques: the zone's name" do
    zone = F.entries_for("zones_bioclimatiques", [ { "value" => "x", "attributes" => { "NOM" => "Sambre-et-Meuse et Condroz" } } ]).first
    assert_equal "Zone bioclimatique : Sambre-et-Meuse et Condroz", zone[:text]
    assert_empty F.entries_for("zones_bioclimatiques", [ { "attributes" => { "NOM" => "Null" } } ])
  end

  test "risk layers: fire, flood, July 2021, erosion" do
    fire = F.entries_for("alea_incendie", [ { "attributes" => { "Raster.FIRE_PROBA" => "Medium hi" } } ]).first
    assert_equal "Probabilité d'incendie : moyenne à élevée", fire[:text]
    assert_empty F.entries_for("alea_incendie", [ { "attributes" => { "Raster.FIRE_PROBA" => "NoData" } } ])

    flood = F.entries_for("alea_inondation", [ { "attributes" => { "VALEUR" => "Aléa faible", "TYPEALEA" => "Débordement" } } ]).first
    assert_equal "Aléa faible par débordement", flood[:text]

    flooded = F.entries_for("zones_inondees_2021", [ { "layerName" => "Zones inondées - par digitalisation" } ]).first
    assert_equal [ "Inondé en juillet 2021", "par digitalisation" ], flooded.values_at(:text, :detail)

    assert_equal "Sensibilité du sol à l'érosion : élevée",
      F.entries_for("sensibilite_erosion", [ { "attributes" => { "Raster.CLASSE_DES" => "Élevée" } } ]).first[:text]
    assert_equal "Risque d'érosion diffuse : faible",
      F.entries_for("erosion_diffuse", [ { "attributes" => { "DESCRIPTION" => "faible" } } ]).first[:text]
    assert_match "non cartographiée", F.entries_for("erosion_diffuse", [ { "attributes" => { "DESCRIPTION" => "non cartographié" } } ]).first[:text]
  end

  test "soil texture, cadmium, DRIGM and remarkable trees" do
    texture = F.entries_for("textures_sol", [ { "attributes" => { "Raster.Libellé de la sous-classe texturale" => "LIMON" } } ]).first
    assert_equal "Texture du sol : Limon", texture[:text]

    cadmium = F.entries_for("cadmium", [ { "attributes" => { "Teneur probable" => "0,4 mg/kg", "Teneur qui a moins de 5% de chance d'être dépassée" => "0,9 mg/kg" } } ]).first
    assert_equal "Cadmium probable : 0,4 mg/kg", cadmium[:text]
    assert_match "0,9 mg/kg", cadmium[:detail]

    drigm = F.entries_for("drigm", [ { "layerName" => "puits de mine" } ]).first
    assert_equal "Puits de mine", drigm[:text]
    assert drigm[:href].start_with?("https://geologie.wallonie.be")

    tree = F.entries_for("arbres_remarquables", [ { "attributes" => {
      "Nom français" => "chêne pédonculé", "Genre" => "Quercus", "Espèce" => "robur", "Cultivar" => "Null", "Circonférence" => "420", "Hauteur" => "25"
    } } ]).first
    assert_match "Chêne pédonculé", tree[:text]
    assert_match "Quercus robur", tree[:text]
    assert_match "420 cm de tour", tree[:detail]
    assert_equal "Zone de haies remarquables", F.entries_for("arbres_remarquables", [ { "attributes" => {} } ]).first[:text]
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

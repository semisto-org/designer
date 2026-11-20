require "test_helper"

class PlantCrownFormTest < ActiveSupport::TestCase
  test "the species' own silhouette wins, else its genus' usual one, flagged as indicative" do
    chestnut = PlantSpecies.new(latin_name: "Castanea sativa")
    assert_equal({ form: "spreading", indicative: true }, PlantCrownForm.for(chestnut))
    chestnut.crown_form = "round"
    assert_equal({ form: "round", indicative: false }, PlantCrownForm.for(chestnut))
  end

  test "a species may differ from its genus, a cultivar's name is read as its species'" do
    assert_equal "weeping", PlantCrownForm.guess("Salix babylonica")[:form]
    assert_equal "multi_stem", PlantCrownForm.guess("Salix viminalis")[:form]
    assert_equal "multi_stem", PlantCrownForm.guess("Cornus mas 'Jolico'")[:form]
    assert_equal "round", PlantCrownForm.guess("Cornus sanguinea")[:form]
    assert_equal "conical", PlantCrownForm.guess("Abies alba")[:form]
    assert_nil PlantCrownForm.guess("Symphytum officinale")
    assert_nil PlantCrownForm.for(nil)
  end

  test "every silhouette of the tables is a known one, and the catalogue refuses others" do
    (PlantCrownForm::BY_GENUS.values + PlantCrownForm::BY_SPECIES.values).uniq.each { |form| assert_includes PlantCrownForm::FORMS, form }
    assert_equal PlantCrownForm::FORMS.sort, PlantVocabulary.keys(:crown_form).sort
    species = PlantSpecies.new(latin_name: "Testus arbor", crown_form: "umbrella")
    assert_not species.valid?
    assert species.errors.key?(:crown_form)
  end

  test "the growth inputs carry it to the 3D view, the time strip and the MCP" do
    assert_equal "spreading", PlantGrowth.inputs(strata: "canopy", species: PlantSpecies.new(latin_name: "Juglans regia"))[:crownForm]
    assert_nil PlantGrowth.inputs(strata: "canopy")[:crownForm]
  end
end

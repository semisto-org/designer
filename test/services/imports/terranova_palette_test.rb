require "test_helper"

class Imports::TerranovaPaletteTest < ActiveSupport::TestCase
  CSV_EXPORT = <<~CSV.freeze
    Nom commun,Nom latin,Strate,Fonctions
    Pommier 'Reinette grise',Malus domestica 'Reinette grise',Canopée,
    Pommier 'Court-pendu',Malus domestica 'Court-pendu',Arborée basse,
    Aulne glutineux,Alnus glutinosa (L.) Gaertn.,Canopée,
    Consoude,Symphytum officinale,Herbacée,
    Néflier,Mespilus germanica,Arbustive,
  CSV

  setup do
    @map = maps(:ahinvaux)
    @map.palette_items.delete_all
  end

  def import(csv = CSV_EXPORT, **options) = Imports::TerranovaPalette.new(map: @map, csv:, **options).call

  test "a dry run matches the catalogue and writes nothing" do
    result = import
    assert_equal 0, @map.palette_items.count
    outcomes = result.lines.to_h { |line| [ line.latin, line.outcome ] }
    assert_equal "added", outcomes["Malus domestica 'Reinette grise'"]
    assert_equal "variety_missing", outcomes["Malus domestica 'Court-pendu'"]
    assert_equal "added", outcomes["Alnus glutinosa (L.) Gaertn."]
    assert_equal "species_missing", outcomes["Mespilus germanica"]
    assert_match "DRY RUN", result.report
  end

  test "applying adds the matched entries with their strata and is idempotent" do
    import(apply: true)
    reinette = @map.palette_items.find_by!(variety: plant_varieties(:reinette))
    assert_equal "canopy", reinette.strata
    assert_nil @map.palette_items.find_by!(species: plant_species(:comfrey), variety: nil).strata, "same as the species default"
    assert_equal 3, @map.palette_items.count

    again = import(apply: true)
    assert_equal 3, @map.palette_items.count
    assert_equal 3, again.counts["already_in_palette"]
  end

  test "create_missing adds the species and cultivars the catalogue lacks, to verify" do
    assert_difference -> { PlantSpecies.count } => 1, -> { PlantVariety.count } => 1 do
      import(apply: true, create_missing: true)
    end
    medlar = PlantSpecies.find_by!(latin_name: "Mespilus germanica")
    assert_equal "Néflier", medlar.common_name
    assert_equal "shrub", medlar.strata
    assert_equal "to_verify", medlar.provenance_for("strata").status
    assert plant_species(:apple).varieties.exists?(name: "Court-pendu")
    assert_equal 5, @map.palette_items.count
  end

  test "a species created by an earlier row is reused by the next ones" do
    csv = "Nom commun,Nom latin\nMenthe verte,Mentha spicata\nMenthe 'Nanah',Mentha spicata 'Nanah'\nMenthe 'Moroccan',Mentha spicata 'Moroccan'\n"
    assert_difference -> { PlantSpecies.count } => 1, -> { PlantVariety.count } => 2 do
      result = import(csv, apply: true, create_missing: true)
      assert_equal %w[species_created variety_created variety_created], result.lines.map(&:outcome)
    end
    assert_equal 3, @map.palette_items.count
  end

  test "reads semicolon exports and the « Nom » column of the other views" do
    result = import("Nom;Prévu (plants)\nConsoude officinale;12\n", apply: true)
    assert_equal [ "added" ], result.lines.map(&:outcome)
    assert_equal 12, @map.palette_items.sole.target_count
  end

  test "rejects a file without a name column" do
    assert_raises(ArgumentError) { import("Foo,Bar\n1,2\n") }
  end
end

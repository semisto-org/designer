require "test_helper"

class Catalog::TerranovaTriageTest < ActiveSupport::TestCase
  AUDITED = "2026-05-01T10:00:00Z".freeze

  test "a clean, audited species with values goes to basket A, most used first" do
    triage = triage(row(1, "Malus domestica"), row(2, "Mespilus germanica", usage: 4), row(3, "Tilia ×europaea"),
                    row(4, "× Sorbaronia mitschurinii"), row(5, "Allium cepa var. proliferum"))
    assert_equal %w[A A A A A], triage.entries.map(&:basket)
    assert_equal "Mespilus germanica", triage.entries.first.latin_name
    assert_includes triage.entries.map(&:latin_name), "Tilia × europaea"
  end

  test "a name to clean, a never audited row or contradicting sizes go to basket B" do
    triage = triage(row(1, "digitalis purpurea"), row(2, "Ficus carica 'Brown Turkey'"), row(3, "Achillea Ptarmica"),
                    row(4, "Corylus avellana", audited: nil), row(5, "Citrus limon", spread_min_cm: 200, spread_max_cm: 100))
    assert_equal %w[B B B B B], triage.entries.map(&:basket)
    assert_equal [ :not_audited ], entry(triage, 4).reasons
    assert_equal [ :inconsistent_sizes ], entry(triage, 5).reasons
  end

  test "of two twins, the best one stays a candidate" do
    triage = triage(row(1, "Mentha x piperita", audited: nil), row(2, "Mentha × piperita", usage: 2))
    assert_equal "A", entry(triage, 2).basket
    assert_equal [ :not_audited, :duplicate ], entry(triage, 1).reasons
  end

  test "a genus alone, a French name or an empty unused row is not migrated" do
    triage = triage(row(1, "Rubus"), row(2, "Mélange mellifère"), row(3, "Unknown"),
                    row(4, "Artemisia absinthium", audited: nil, height_max_cm: nil, hardiness: nil))
    assert_equal %w[C C C C], triage.entries.map(&:basket)
    assert_equal [ :not_audited, :no_values ], entry(triage, 4).reasons
  end

  test "an empty row that someone uses is kept for cleaning" do
    triage = triage(row(1, "Artemisia absinthium", audited: nil, height_max_cm: nil, hardiness: nil, usage: 1))
    assert_equal "B", triage.entries.sole.basket
  end

  test "lists the values the Designer already holds and Terranova contradicts" do
    species = PlantSpecies.create!(latin_name: "Asimina triloba", plant_type: "tree", height_max_m: 8)
    match = triage(row(1, "Asimina triloba")).entries.sole
    assert_equal species, match.match
    assert_equal [ [ "height_max_m", species.height_max_m, 5.0 ] ], match.conflicts
  end

  private
    def triage(*rows) = Catalog::TerranovaTriage.new(rows)

    def entry(triage, id) = triage.entries.find { _1.id == id }

    def row(id, name, audited: AUDITED, usage: 0, height_max_cm: 500, hardiness: "zone-5", **extra)
      { "id" => id, "latin_name" => name, "audited_at" => audited, "plant_type" => "tree", "height_max_cm" => height_max_cm,
        "hardiness" => hardiness, "usage" => { "total" => usage } }.merge(extra.transform_keys(&:to_s))
    end
end

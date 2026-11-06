require "test_helper"

class MapVariantTest < ActiveSupport::TestCase
  POINT = { "type" => "Point", "coordinates" => [ 4.907, 50.341 ] }.freeze
  SHAPE = { "type" => "Polygon", "coordinates" => [ [ [ 4.907, 50.341 ], [ 4.9072, 50.341 ], [ 4.9072, 50.3412 ], [ 4.907, 50.341 ] ] ] }.freeze

  setup do
    @map = maps(:ahinvaux)
    @one = @map.variants.create!(name: "Projet 1")
    @two = @map.variants.create!(name: "Projet 2")
  end

  def pond(variant: nil, planned: true)
    @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, properties: planned ? { "planned" => true } : {}, variant:)
  end

  test "the first variant is retained, the next ones placed after it" do
    assert @one.retained?
    assert_not @two.retained?
    assert_equal [ 0, 1 ], [ @one.position, @two.position ]
  end

  test "retaining one variant releases the other" do
    @two.retain!
    assert @two.reload.retained?
    assert_not @one.reload.retained?
  end

  test "the design counts the common project and the retained variant only" do
    common = pond
    own_one = pond(variant: @one)
    own_two = pond(variant: @two)
    ids = @map.features.in_design.pluck(:id)
    assert_includes ids, common.id
    assert_includes ids, own_one.id
    assert_not_includes ids, own_two.id
    @two.retain!
    assert_includes @map.features.in_design.pluck(:id), own_two.id
    sql = MapFeature.where("map_id = ? AND #{MapFeature.in_design_sql}", @map.id).pluck(:id)
    assert_equal @map.features.in_design.pluck(:id).sort, sql.sort
  end

  test "what is on the ground belongs to no variant" do
    built = pond(variant: @two, planned: false)
    assert_nil built.variant_id
    planned = pond(variant: @two)
    planned.update!(properties: { "built_on" => "2026-11-05" })
    assert_nil planned.reload.variant_id
  end

  test "notes and drafts keep their variant, a variant never stores twice in properties" do
    note = @map.features.create!(layer: "notes", kind: "note", geometry: POINT, variant: @two, properties: { "variant_id" => 99 })
    assert_equal @two.id, note.variant_id
    assert_not note.properties.key?("variant_id")
    draft = @map.features.create!(layer: "water", kind: "pond", geometry: SHAPE, status: "draft", source: "ai", variant: @two)
    assert_equal @two.id, draft.variant_id
  end

  test "a variant of another map is refused" do
    other = maps(:ahinvaux).dup.tap { _1.save!(validate: false) }.variants.create!(name: "Ailleurs")
    feature = @map.features.build(layer: "water", kind: "pond", geometry: SHAPE, properties: { "planned" => true }, variant: other)
    assert_not feature.valid?
  end

  test "duplicating copies the variant's own elements, not the common ones" do
    pond
    pond(variant: @one).update!(properties: { "planned" => true, "number" => 3 })
    copy = @one.duplicate!(name: "Projet 1 (copie)")
    assert_not copy.retained?
    assert_equal 1, copy.features.count
    assert_nil copy.features.first.properties["number"]
  end

  test "deleting a variant trashes its own elements and retains another" do
    own = pond(variant: @one)
    common = pond
    @one.destroy!
    assert_nil MapFeature.find_by(id: own.id)
    assert MapFeature.unscoped.find(own.id).deleted_at
    assert MapFeature.find(common.id)
    assert @two.reload.retained?
  end

  test "a map keeps a bounded number of variants" do
    (MapVariant::MAX_PER_MAP - 2).times { |i| @map.variants.create!(name: "Idée #{i}") }
    extra = @map.variants.build(name: "De trop")
    assert_not extra.valid?
    assert_match "au plus", extra.errors.full_messages.to_sentence
  end
end

require "test_helper"

class ImportRecordTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  def entry(**attrs)
    ImportRecord.new(map: @map, source: "claudy", external_type: "map_feature", external_id: "110", imported_at: Time.current, **attrs)
  end

  test "one entry per upstream record and map" do
    entry(record: map_features(:pond)).save!
    assert_not entry.valid?
    assert entry(external_type: "plant").valid?
  end

  test "knows when its Designer record was deleted" do
    record = entry(record: map_features(:pond))
    record.save!
    assert_not record.record_missing?
    map_features(:pond).destroy!
    assert record.reload.record_missing?
    assert_not entry(external_id: "111").record_missing?
  end

  test "goes away with its map" do
    entry.save!
    assert_difference -> { ImportRecord.count }, -1 do
      @map.destroy!
    end
  end
end

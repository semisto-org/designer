# Where a map's water comes from (well, rain, forest catchment…), and whether
# it is drinkable. Taps point to one through `properties.water_source_id`.
#
# Maps imported from Claudy carry the source on each network element
# (`properties.water_source`): their sources are created here and their taps
# linked, so Les 4 Sources keep what Claudy knew.
class CreateWaterSources < ActiveRecord::Migration[8.1]
  CLAUDY_SOURCES = {
    "well" => [ "Eau de puits", true ],
    "rain" => [ "Eau de pluie", false ],
    "forest_catchment" => [ "Eau de captage forestier", false ]
  }.freeze

  def up
    create_table :water_sources do |t|
      t.references :map, null: false, foreign_key: true
      t.string :name, null: false
      t.boolean :potable, null: false, default: false
      t.text :notes
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :water_sources, "map_id, lower(name)", unique: true, name: "index_water_sources_on_map_and_name"

    link_claudy_taps
  end

  def down
    execute <<~SQL
      UPDATE map_features SET properties = properties - 'water_source_id'
      WHERE properties ? 'water_source_id'
    SQL
    drop_table :water_sources
  end

  private
    def link_claudy_taps
      rows = select_rows(<<~SQL)
        SELECT DISTINCT map_id, properties->>'water_source' FROM map_features
        WHERE properties->>'water_source' IN (#{CLAUDY_SOURCES.keys.map { |k| connection.quote(k) }.join(", ")})
        ORDER BY 1, 2
      SQL
      rows.group_by(&:first).each do |map_id, pairs|
        pairs.map(&:last).sort_by { |key| CLAUDY_SOURCES.keys.index(key) }.each_with_index do |key, position|
          name, potable = CLAUDY_SOURCES.fetch(key)
          source_id = select_value(<<~SQL)
            INSERT INTO water_sources (map_id, name, potable, position, created_at, updated_at)
            VALUES (#{map_id.to_i}, #{connection.quote(name)}, #{potable}, #{position}, NOW(), NOW())
            RETURNING id
          SQL
          execute <<~SQL
            UPDATE map_features
            SET properties = properties || jsonb_build_object('water_source_id', #{source_id.to_i}, 'potable', #{potable}),
                lock_version = lock_version + 1, updated_at = NOW()
            WHERE map_id = #{map_id.to_i} AND kind = 'tap' AND properties->>'water_source' = #{connection.quote(key)}
          SQL
        end
      end
    end
end

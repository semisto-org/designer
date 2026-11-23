# Some species of the Terranova import came in « reviewed » but empty: no
# habit, no size, and Terranova's default strata, « arbuste ». The benoîte
# commune (Geum urbanum), a 30-60 cm perennial, was drawn as a 1.5 m shrub.
#
# The starter seed (db/seeds/plants/*.yml) now carries their real sheets, but
# it never overwrites a value another source wrote. For these species only,
# while the sheet is still empty, this hands the import's default strata and
# French names over to the seed: they are cleared here, and the seed that runs
# right after the migrations on every deploy writes them again. A value a
# person checked (status « sourced ») is never touched.
class HandEmptyImportedSheetsToTheSeed < ActiveRecord::Migration[8.1]
  LATIN_NAMES = [
    "Geum urbanum", "Campanula trachelium", "Epilobium hirsutum", "Linum usitatissimum",
    "Dianthus carthusianorum", "Stellaria media", "Claytonia sibirica", "Tropaeolum majus",
    "Mesembryanthemum crystallinum", "Acca sellowiana", "Prunus pumila", "Viburnum edule",
    "Artemisia abrotanum"
  ].freeze

  def up
    names = LATIN_NAMES.map { |name| connection.quote(name.downcase) }.join(", ")
    ids = select_values(<<~SQL)
      SELECT s.id FROM plant_species s
      WHERE lower(s.latin_name) IN (#{names})
        AND s.plant_type IS NULL AND s.height_max_m IS NULL AND s.spread_max_m IS NULL
    SQL
    return if ids.empty?
    list = ids.join(", ")

    execute <<~SQL
      UPDATE plant_species s SET strata = NULL, updated_at = NOW()
      WHERE s.id IN (#{list})
        AND NOT EXISTS (SELECT 1 FROM plant_field_sources fs WHERE fs.record_type = 'PlantSpecies'
                        AND fs.record_id = s.id AND fs.field = 'strata' AND fs.status = 'sourced')
    SQL
    execute <<~SQL
      DELETE FROM plant_field_sources fs
      WHERE fs.record_type = 'PlantSpecies' AND fs.record_id IN (#{list}) AND fs.field = 'strata' AND fs.status <> 'sourced'
    SQL

    unsourced_names = <<~SQL
      SELECT s.id FROM plant_species s WHERE s.id IN (#{list})
        AND NOT EXISTS (SELECT 1 FROM plant_field_sources fs WHERE fs.record_type = 'PlantSpecies'
                        AND fs.record_id = s.id AND fs.field = 'common_names' AND fs.status = 'sourced')
    SQL
    execute <<~SQL
      DELETE FROM plant_common_names n
      WHERE n.nameable_type = 'PlantSpecies' AND n.language = 'fr' AND n.nameable_id IN (#{unsourced_names})
    SQL
    execute <<~SQL
      DELETE FROM plant_field_sources fs
      WHERE fs.record_type = 'PlantSpecies' AND fs.field = 'common_names' AND fs.status <> 'sourced'
        AND fs.record_id IN (#{list})
    SQL
    say "#{ids.size} empty imported sheets handed to the seed"
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

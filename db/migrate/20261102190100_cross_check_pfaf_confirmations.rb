# The values the catalogue review made « sourced from PFAF » only because
# PFAF confirmed them go back to their species' own source, still to verify,
# marked « recoupée avec PFAF ». Values PFAF gave (taken by a reviewer, or
# imported citing PFAF) keep citing it.
class CrossCheckPfafConfirmations < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      UPDATE plant_field_sources fs
      SET cross_checked_with = 'pfaf', status = 'to_verify', license = NULL, url = NULL, updated_at = NOW(),
          source = COALESCE((
            SELECT other.source FROM plant_field_sources other
            WHERE other.record_type = fs.record_type AND other.record_id = fs.record_id
              AND other.source NOT IN ('pfaf', 'wikipedia')
            GROUP BY other.source ORDER BY COUNT(*) DESC, other.source LIMIT 1
          ), 'user')
      FROM plant_value_checks checks
      WHERE fs.record_type = 'PlantSpecies' AND fs.record_id = checks.species_id AND fs.field = checks.field
        AND checks.source = 'pfaf' AND checks.verdict = 'confirmed'
        AND fs.source = 'pfaf' AND fs.status = 'sourced'
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end

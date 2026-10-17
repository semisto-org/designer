# Elements imported or drawn as « Proposition — Mare de tête ouest » are a
# project, not something on the ground: mark them `planned`, so that
# « Situation actuelle » leaves them out (MapFeature planned elements, see
# app/frontend/map/scenario.ts). Plants have their own rule (planted_on).
class MarkProposalsAsPlanned < ActiveRecord::Migration[8.1]
  class Feature < ActiveRecord::Base
    self.table_name = "map_features"
  end

  PROPOSAL = "^\\s*proposition\\s*[—–:-]"

  def up
    Feature.where.not(layer: %w[plants existing notes])
      .or(Feature.where(layer: "plants").where.not(kind: "plant"))
      .where("name ~* ?", PROPOSAL)
      .where("NOT (properties ? 'planned')")
      .update_all([ "properties = properties || ?::jsonb, lock_version = lock_version + 1", { planned: true }.to_json ])
  end

  def down
    Feature.where("name ~* ?", PROPOSAL).where("properties ? 'planned'")
      .update_all("properties = properties - 'planned', lock_version = lock_version + 1")
  end
end

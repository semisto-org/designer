# A patio (`terrace`) on a slope is now levelled like a graded terrace
# (Relief::Grading, hung in the middle): give the patios already drawn their
# cut and fill, map by map. Maps without a relief are skipped (their next
# relief import grades them), and a failure never stops the deploy.
class GradePatioTerraces < ActiveRecord::Migration[8.1]
  def up
    map_ids = MapFeature.where(kind: "terrace").where.not(status: "rejected").distinct.pluck(:map_id)
    Map.where(id: map_ids).find_each { |map| MapFeature.regrade_map(map) }
  end

  def down; end
end

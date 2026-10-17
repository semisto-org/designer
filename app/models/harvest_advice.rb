# « Que faire de cette récolte ? » for one fruit plant of a map: what its
# variety is good for and how long it keeps (catalogue, with provenance),
# turned into a plain suggestion, and what this place already did with the
# same variety (uses and notes of its harvest lines, all trees together).
class HarvestAdvice
  NOTES_SHOWN = 3

  def initialize(map, feature)
    @map = map
    @feature = feature
  end

  def variety
    return @variety if defined?(@variety)
    @variety = @feature.plant_variety_id && PlantVariety.includes(:field_sources).find_by(id: @feature.plant_variety_id)
  end

  def as_json(*)
    v = variety
    {
      variety: v&.uses_json,
      keeping: v&.keeping,
      # Picked before it is good: it ripens in the cellar.
      ripensInStore: !!(v&.picking_month && v.eating_from_month && v.eating_from_month != v.picking_month),
      here: here(v)
    }
  end

  private
    # This place's harvests of the same variety (or of this very plant, when
    # it has no variety): how often each use, and the latest notes.
    def here(v)
      lines = @map.plant_harvests.where(stage: "picked")
      lines = v ? lines.where(variety_id: v.id) : lines.where(map_feature_id: @feature.id)
      lines = lines.includes(:map_feature).newest_first.to_a
      {
        picked: lines.size,
        uses: PlantHarvest::USES.index_with { |use| lines.count { _1.uses.include?(use) } }.select { |_, n| n.positive? },
        notes: lines.select { _1.note.present? }.first(NOTES_SHOWN).map do |line|
          { featureId: line.map_feature_id, plant: line.map_feature.name, notedOn: line.noted_on.iso8601, note: line.note }
        end
      }
    end
end

# The cut and fill of a graded terrace or profile (Relief::Grading), kept in
# `properties["grading"]` so the inspector, the earthworks balance, the
# exports and the MCP read the same numbers: level, cut and fill (m³ in
# place), the surfaces lowered and raised, the deepest cut and highest fill.
# Computed on save from the map's relief; absent without a relief (or when
# the plan has no analyses), and recomputed for the whole map once a relief
# is imported (`MapFeature.regrade_map`). Never taken from the client.
module MapFeature::Grading
  extend ActiveSupport::Concern

  KINDS = Relief::Grading::KINDS

  included do
    before_save :compute_grading, if: -> { KINDS.include?(kind) }
  end

  class_methods do
    # After a relief import: every graded feature of the map gets its volumes.
    def regrade_map(map)
      features = map.features.where(kind: KINDS).where.not(status: "rejected").to_a
      return if features.empty?

      grading = MapFeature.grading_for(map)
      features.each do |feature|
        value = grading&.call(feature)
        next if feature.properties["grading"] == value

        feature.update_columns(properties: feature.properties.merge("grading" => value).compact)
      end
    rescue StandardError => e
      # Never fail the relief import over it: the next save computes them.
      Rails.logger.warn("[grading] map #{map.id}: #{e.class}: #{e.message}")
    end

    def grading_for(map)
      terrain = map&.terrain
      return nil unless terrain&.ready? && terrain.grid.attached?

      Relief::Grading.new(terrain)
    end
  end

  def grading = properties.to_h["grading"]

  private
    def compute_grading
      props = properties.to_h.except("grading")
      self.properties = props # never what the client sent
      value = begin
        MapFeature.grading_for(map)&.call(self)
      rescue StandardError => e
        Rails.logger.warn("[grading] feature #{id}: #{e.class}: #{e.message}")
        nil
      end
      self.properties = props.merge("grading" => value) if value
    end
end

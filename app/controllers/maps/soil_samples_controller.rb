# Soil sampling points of a map and their lab results. Guide, points and raw
# results are free; the reading of the results (bands, explanations, texture
# class) is an analysis, included only when the map owner's plan has them.
module Maps
  class SoilSamplesController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!, except: :index
    before_action :set_sample, only: %i[update destroy]

    MAX_BULK = SoilAnalysis::SamplingSuggestions::MAX_POINTS
    # Meters kept clear along the boundary, and around what a sample must avoid.
    EDGE_MARGIN = 5.0
    OBSTACLE_MARGIN = 3.0
    # Buildings and water by kind; everything that is not a point in the
    # structures, water and access layers (buildings, fences, ponds, swales, paths).
    OBSTACLE_KINDS = %w[building house shed barn greenhouse pond lake].freeze

    def index
      analyses = map_entitlements.analyses?
      render json: {
        samples: @map.soil_samples.ordered.with_attached_lab_report.map { |sample| sample.as_inertia(analyses:) },
        analyses:,
        fields: SoilSample::RESULT_FIELDS.map { |key, spec| { key:, unit: spec[:unit], min: spec[:range].min, max: spec[:range].max } },
        # Band limits, shown above the compare table: part of the analysis.
        bands: analyses ? SoilAnalysis::Interpretation::BANDED.index_with { |key| SoilSample::RESULT_FIELDS[key].slice(:low_below, :high_above) } : nil,
        provenance: SoilAnalysis::Interpretation::PROVENANCE
      }
    end

    def create
      sample = @map.soil_samples.new(sample_params.merge(created_by: Current.user))
      sample.save ? render(json: sample.as_inertia(analyses: map_entitlements.analyses?), status: :created) : render_errors(sample)
    end

    def update
      @sample.update(sample_params) ? render(json: @sample.as_inertia(analyses: map_entitlements.analyses?)) : render_errors(@sample)
    end

    def destroy
      @sample.destroy!
      head :no_content
    end

    # Where to sample: points spread over the boundary, away from buildings,
    # water and paths. Nothing is saved: the user accepts them (bulk).
    def suggestions
      return render(json: { message: t("soil.errors.no_boundary") }, status: :unprocessable_entity) unless @map.boundary
      result = SoilAnalysis::SamplingSuggestions.new(
        boundary: @map.boundary, obstacles: obstacle_geometries, existing: @map.soil_samples.located.map(&:location),
        count: params.fetch(:count, 5), edge_margin: EDGE_MARGIN, obstacle_margin: OBSTACLE_MARGIN
      ).call
      render json: {
        points: result.points.map(&:to_h), usableAreaM2: result.usable_area_m2,
        edgeMargin: EDGE_MARGIN, obstacleMargin: OBSTACLE_MARGIN
      }
    end

    # Accepts suggested points (or any list of positions): one planned sample each.
    def bulk
      points = Array(params[:points]).first(MAX_BULK).filter_map { |point| MapPhoto.point_from(point[:lng], point[:lat]) }
      return head :unprocessable_entity if points.empty?
      samples = SoilSample.transaction do
        next_number = @map.soil_samples.count
        points.each_with_index.map do |location, index|
          @map.soil_samples.create!(label: t("soil.points.default_label", number: next_number + index + 1), location:,
                                    source: "suggested", created_by: Current.user)
        end
      end
      render json: { samples: samples.map { |sample| sample.as_inertia(analyses: map_entitlements.analyses?) } }, status: :created
    end

    private
      def set_sample
        @sample = @map.soil_samples.find(params[:id])
      end

      def obstacle_geometries
        @map.features.active.where("layer IN ('structures', 'water', 'access') OR kind IN (?)", OBSTACLE_KINDS)
          .where("GeometryType(geometry) NOT IN ('POINT', 'MULTIPOINT')").map(&:geometry)
      end

      def sample_params
        raw = params.require(:soil_sample).permit(:label, :depth_from_cm, :depth_to_cm, :status, :sampled_on, :lab, :lab_reference, :notes, :lng, :lat, results: SoilSample::RESULT_KEYS)
        raw[:location] = MapPhoto.point_from(raw[:lng], raw[:lat]) if raw.key?(:lng) || raw.key?(:lat)
        raw.except(:lng, :lat)
      end
  end
end

module Mcp
  # Turns features proposed by an AI into drafts on a map. Each feature is
  # checked on its own (layer, kind, valid geometry lying within BUFFER_M
  # of the terrain boundary, reasonable size); valid ones become MapFeature
  # rows with status "draft" and source "ai", the others are reported back
  # with the reason, so the AI can fix and resend only those.
  class DraftProposal
    MAX_FEATURES = 200
    MAX_PENDING = 1000
    BUFFER_M = GeometryCheck::BUFFER_M
    MAX_PROPERTIES_BYTES = 4000
    # Sensitive networks are never proposed by an AI.
    LAYERS = (MapFeature::LAYERS - %w[networks]).freeze
    KIND_FORMAT = /\A[a-z][a-z0-9_]{0,59}\z/

    Outcome = Data.define(:created, :rejected)

    def initialize(map:, user:)
      @map = map
      @user = user
    end

    def call(items)
      raise ToolError, I18n.t("mcp.errors.no_boundary") if @map.boundary.nil?
      raise ToolError, I18n.t("mcp.errors.too_many_features", max: MAX_FEATURES) if items.size > MAX_FEATURES

      rejected = []
      candidates = []
      items.each_with_index do |item, index|
        error = static_error(item)
        error ? rejected << { index:, error: } : candidates << [ index, item ]
      end

      spatial = spatial_check(candidates)
      valid = candidates.filter_map do |index, item|
        error = spatial[index]
        error ? (rejected << { index:, error: }) && nil : [ index, item ]
      end

      pending = @map.features.drafts.count
      if pending + valid.size > MAX_PENDING
        raise ToolError, I18n.t("mcp.errors.too_many_pending", max: MAX_PENDING, pending:)
      end

      created = create(valid)
      Outcome.new(created:, rejected: rejected.sort_by { |r| r[:index] })
    end

    private
      def err(key, **options) = I18n.t("mcp.draft_errors.#{key}", **options)

      def static_error(item)
        return err(:not_an_object) unless item.is_a?(Hash)
        return err(:layer, layers: LAYERS.join(", ")) unless LAYERS.include?(item[:layer].to_s)
        return err(:kind) unless item[:kind].to_s.match?(KIND_FORMAT)
        return err(:rationale) if item[:rationale].to_s.strip.length < 10
        geometry_error = GeometryCheck.static_error(item[:geometry])
        return geometry_error if geometry_error
        return err(:tags, max: MapFeature::Tags::MAX_TAGS, length: MapFeature::Tags::MAX_LENGTH) unless valid_tags?(item[:tags])
        return err(:properties, max: MAX_PROPERTIES_BYTES) if item[:properties] && (!item[:properties].is_a?(Hash) || item[:properties].to_json.bytesize > MAX_PROPERTIES_BYTES)
        nil
      end

      def valid_tags?(tags)
        return true if tags.nil?
        tags.is_a?(Array) && tags.size <= MapFeature::Tags::MAX_TAGS &&
          tags.all? { |tag| tag.is_a?(String) && MapFeature.normalize_tag(tag).length <= MapFeature::Tags::MAX_LENGTH }
      end

      def parse(geometry) = GeometryCheck.parse(geometry)

      def spatial_check(candidates)
        GeometryCheck.spatial_errors(@map, candidates.map { |index, item| [ index, item[:geometry] ] })
      end

      def create(valid)
        return [] if valid.empty?
        created = MapFeature.transaction do
          MapFeature.no_touching do
            valid.map do |index, item|
              feature = @map.features.create!(
                layer: item[:layer].to_s, kind: item[:kind].to_s,
                name: item[:name].to_s.strip.first(120).presence,
                notes: item[:notes].to_s.strip.first(2000).presence,
                rationale: item[:rationale].to_s.strip.first(2000),
                properties: (item[:properties] || {}).deep_stringify_keys.except(*MapFeature.column_names),
                tags: Array(item[:tags]),
                style: item[:color].to_s.match?(/\A#\h{6}\z/) ? { "color" => item[:color].downcase } : {},
                geometry: parse(item[:geometry]),
                status: "draft", source: "ai",
                created_by: @user, updated_by: @user
              )
              { index:, feature: }
            end
          end
        end
        @map.touch
        created
      end
  end
end

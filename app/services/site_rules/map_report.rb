module SiteRules
  # What the « Règles et risques » panel shows for a map, and what an AI
  # agent can read: the natural and technological risks at the map's place
  # and the town-planning rules that apply to its outline (zoning, local
  # plan, prescriptions, public utility easements), each with a short,
  # indicative line on what it means for a forest garden.
  #
  # Providers come from the region settings (`site_rules.risks`,
  # `site_rules.urbanism`); a region without them answers "not_configured"
  # and lists the region layers that cover the subject instead
  # (`site_rules.layers`, e.g. the plan de secteur in Wallonia).
  #
  # Output keys are camelCase (JSON for the frontend). Network easements
  # (electricity, gas, pipes, telecoms) carry `network: true`: callers that
  # serve public views, exports or the MCP drop them by default
  # (`include_networks: false`).
  class MapReport
    # Above this many vertices the outline is simplified before it is sent.
    MAX_VERTICES = 400

    def initialize(map, risks: :region, urbanism: :region, include_networks: true)
      @map = map
      @region = map.region
      @risks = risks == :region ? Providers::Georisques.for(@region) : risks
      @urbanism = urbanism == :region ? Providers::Urbanism.for(@region) : urbanism
      @include_networks = include_networks
    end

    def point = @point ||= Providers::Climate::Point.from(@map.center)

    # A provider for the region, not switched off by ENV.
    def configured? = !!(@risks&.available? || @urbanism&.available?)

    def as_json(*)
      camelize(
        region: @region && { key: @region.key, name: @region.name },
        configured: configured?,
        location: point && { lng: point.lng.round(4), lat: point.lat.round(4) },
        queried_with: @urbanism && geometry && (outline? ? "outline" : "center"),
        risks: risks_json,
        urbanism: urbanism_json,
        layers: configured? ? [] : layers_json,
        sources: sources
      )
    end

    private
      def risks_json
        return { available: false, reason: "not_configured" } unless @risks&.available?
        return { available: false, reason: "no_location" } unless point

        report = (@risks_report ||= @risks.report_at(point))
        items = report[:risks].map { risk_json(_1) }
        {
          available: true,
          scope: report[:scope],
          address: report[:address],
          commune: report[:commune].slice(:name, :insee),
          report_url: report[:url] || Providers::Georisques::REPORT_PAGE,
          items: items.partition { _1[:present] }.flatten(1)
        }
      rescue Providers::Georisques::Unavailable => e
        Rails.logger.info("[site_rules] georisques unavailable: #{e.message}")
        { available: false, reason: "unavailable" }
      end

      def risk_json(risk)
        key = risk[:key].to_s.underscore
        {
          key:, group: risk[:group], present: risk[:present],
          label: I18n.t("site_rules.risks.items.#{key}.label", default: risk[:upstream_label] || key.humanize),
          level: risk[:address_status] || risk[:commune_status],
          scope: risk[:address_status] ? "address" : "commune",
          advice: risk[:present] ? I18n.t("site_rules.risks.items.#{key}.advice", default: nil) : nil
        }
      end

      def urbanism_json
        return { available: false, reason: "not_configured" } unless @urbanism&.available?
        return { available: false, reason: "no_location" } unless geometry

        rules = (@urbanism_rules ||= @urbanism.rules_for(geometry))
        easements = rules[:easements].reject { !@include_networks && _1[:network] }
        {
          available: true,
          partial: rules[:partial],
          communes: rules[:communes],
          rnu: rules[:rnu],
          # A commune with a plan that is not (yet) on the GPU: ask the town hall.
          document_missing: rules[:documents].empty? && !rules[:rnu],
          documents: rules[:documents].map { _1.except(:id) },
          zones: rules[:zones].map { _1.merge(advice: I18n.t("site_rules.urbanism.zones.#{_1[:family]}.advice")) },
          sectors: rules[:sectors].map { _1.merge(advice: I18n.t("site_rules.urbanism.sectors.#{_1[:family]}.advice")) },
          prescriptions: rules[:prescriptions].map { prescription_json(_1) }.partition { _1[:advice] }.flatten(1),
          easements: easements.map { easement_json(_1) }
        }
      rescue Providers::Urbanism::Unavailable => e
        Rails.logger.info("[site_rules] urbanism unavailable: #{e.message}")
        { available: false, reason: "unavailable" }
      end

      def prescription_json(prescription)
        prescription.merge(advice: I18n.t("site_rules.urbanism.prescriptions.#{prescription[:type]}", default: nil))
      end

      def easement_json(easement)
        category = easement[:category].to_s
        easement.merge(
          label: I18n.t("site_rules.urbanism.easements.#{category}.label", default: category.upcase),
          advice: I18n.t("site_rules.urbanism.easements.#{category}.advice", default: I18n.t("site_rules.urbanism.easements.default_advice"))
        )
      end

      def layers_json
        keys = Array(@region&.setting(:site_rules, :layers))
        return [] if keys.empty?

        layers = @region.catalogue.enabled.where(key: keys).index_by(&:key)
        keys.filter_map { |key| (layer = layers[key]) && { key:, name: layer.name } }
      end

      def sources
        list = []
        list << source(:georisques, "https://www.georisques.gouv.fr") if risks_available?
        list << source(:gpu, "https://www.geoportail-urbanisme.gouv.fr") if urbanism_available?
        list
      end

      def source(key, url)
        { key: key.to_s, publisher: I18n.t("site_rules.sources.#{key}.publisher"), title: I18n.t("site_rules.sources.#{key}.title"),
          licence: I18n.t("site_rules.sources.licence"), url: }
      end

      def risks_available? = @risks_report.present?

      def urbanism_available? = @urbanism_rules.present?

      # The outline when the map has one, else its center point, as GeoJSON.
      def geometry
        return @geometry if defined?(@geometry)

        @geometry = if outline?
          shape = @map.boundary
          shape = shape.simplify_preserve_topology(0.00005) if vertices(shape) > MAX_VERTICES && shape.respond_to?(:simplify_preserve_topology)
          round(RGeo::GeoJSON.encode(shape))
        elsif point
          { "type" => "Point", "coordinates" => [ point.lng.round(6), point.lat.round(6) ] }
        end
      end

      def outline? = @map.boundary.present? && !@map.boundary.empty?

      def vertices(shape) = Array(RGeo::GeoJSON.encode(shape)["coordinates"]).flatten.size / 2

      def round(value)
        case value
        when Hash then value.transform_values { round(_1) }
        when Array then value.map { round(_1) }
        when Float then value.round(6)
        else value
        end
      end

      # Symbol keys become camelCase strings; string keys are data.
      def camelize(value)
        case value
        when Hash then value.to_h { |key, item| [ key.is_a?(Symbol) ? key.to_s.camelize(:lower) : key, camelize(item) ] }
        when Array then value.map { camelize(_1) }
        else value
        end
      end
  end
end

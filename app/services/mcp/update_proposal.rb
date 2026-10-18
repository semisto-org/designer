module Mcp
  # Turns changes an AI proposes to elements already on a map into pending
  # FeatureUpdateDrafts, all of one call in one batch. Each element is
  # checked on its own; what cannot be proposed comes back with its reason
  # (rejected), what would change nothing comes back as unchanged, and a new
  # proposal replaces the element's pending one.
  class UpdateProposal
    MAX_UPDATES = 200
    MAX_FILTERED = 500
    MAX_PENDING = 2000
    MAX_PROPERTIES_BYTES = DraftProposal::MAX_PROPERTIES_BYTES
    ALLOWED = FeatureUpdateDraft::FIELDS
    # Integer references to the plant catalogue, and quantities.
    INTEGER_PROPERTIES = %w[species_id variety_id count number].freeze
    DATE_FORMAT = /\A\d{4}-\d{2}-\d{2}\z/

    Outcome = Data.define(:batch, :created, :unchanged, :rejected)

    def initialize(map:, user:, client_name: nil, summary: nil)
      @map = map
      @user = user
      @client_name = client_name
      @summary = summary.to_s.strip.first(1000).presence
    end

    # The reason a `changes` object cannot be proposed at all (same for every
    # element), or nil.
    def self.changes_error(changes)
      return err(:changes_empty) unless changes.is_a?(Hash) && changes.any?
      changes = changes.deep_stringify_keys
      forbidden = changes.keys - ALLOWED
      return err(:forbidden, fields: forbidden.join(", "), allowed: ALLOWED.join(", ")) if forbidden.any?
      %w[name notes].each do |field|
        next unless changes.key?(field)
        return err(:text, field:) unless changes[field].nil? || changes[field].is_a?(String)
      end
      return err(:name_length) if changes["name"].to_s.strip.length > 120
      return err(:notes_length) if changes["notes"].to_s.strip.length > 2000
      if changes.key?("tags")
        tags = changes["tags"]
        valid = tags.is_a?(Array) && tags.size <= MapFeature::Tags::MAX_TAGS &&
          tags.all? { |tag| tag.is_a?(String) && MapFeature.normalize_tag(tag).length <= MapFeature::Tags::MAX_LENGTH }
        return I18n.t("mcp.draft_errors.tags", max: MapFeature::Tags::MAX_TAGS, length: MapFeature::Tags::MAX_LENGTH) unless valid
      end
      if changes.key?("properties")
        properties_error(changes["properties"])&.then { |error| return error }
      end
      if changes.key?("geometry")
        GeometryCheck.static_error(changes["geometry"])&.then { |error| return error }
      end
      nil
    end

    def self.properties_error(properties)
      return err(:properties, max: MAX_PROPERTIES_BYTES) unless properties.is_a?(Hash) && properties.any? && properties.to_json.bytesize <= MAX_PROPERTIES_BYTES
      system = properties.keys.map(&:to_s) & (MapFeature.column_names + %w[lockVersion updatedAt])
      return err(:system_properties, keys: system.join(", ")) if system.any?
      properties.each do |key, value|
        next if value.nil?
        key = key.to_s
        if key.end_with?("_on") && !(value.is_a?(String) && value.match?(DATE_FORMAT) && (Date.iso8601(value) rescue nil))
          return err(:date, key:)
        end
        return err(:future_date, key:) if key == "planted_on" && Date.iso8601(value) > PlantableFeature.latest_today
        return err(:training, allowed: PlantableFeature::TRAININGS.join(", ")) if key == "training" && !PlantableFeature::TRAININGS.include?(value)
        return err(:graft_form, allowed: PlantableFeature::GRAFT_FORMS.join(", ")) if key == "graft_form" && !PlantableFeature::GRAFT_FORMS.include?(value)
        return err(:rootstock_vigor, allowed: PlantableFeature::ROOTSTOCK_VIGORS.join(", ")) if key == "rootstock_vigor" && !PlantableFeature::ROOTSTOCK_VIGORS.include?(value)
        if key == "trunk_height" && !(value.is_a?(Numeric) && PlantableFeature::TRUNK_HEIGHTS.cover?(value))
          return err(:trunk_height, min: PlantableFeature::TRUNK_HEIGHTS.min, max: PlantableFeature::TRUNK_HEIGHTS.max)
        end
        return err(:rootstock, max: PlantableFeature::ROOTSTOCK_LENGTH) if key == "rootstock" && !(value.is_a?(String) && value.length <= PlantableFeature::ROOTSTOCK_LENGTH)
        if INTEGER_PROPERTIES.include?(key) && !(value.to_s.match?(/\A\d{1,9}\z/) && value.to_i.positive?)
          return err(:integer, key:)
        end
      end
      species_id = properties.to_h.stringify_keys["species_id"]
      return err(:species, id: species_id) if species_id && !PlantSpecies.exists?(species_id.to_i)
      variety_id = properties.to_h.stringify_keys["variety_id"]
      return err(:variety, id: variety_id) if variety_id && !PlantVariety.exists?(variety_id.to_i)
      nil
    end

    def self.err(key, **options) = I18n.t("mcp.update_errors.#{key}", **options)

    # items: [ { feature_id:, changes:, rationale: } ], at most MAX_FILTERED.
    def call(items)
      batch = SecureRandom.uuid
      rejected = []
      unchanged = []
      ids = items.map { |item| item[:feature_id].to_i }
      features = @map.features.where(id: ids).index_by(&:id)
      pending = @map.feature_update_drafts.pending.where(map_feature_id: ids).index_by(&:map_feature_id)

      candidates = []
      items.each_with_index do |item, index|
        feature = features[item[:feature_id].to_i]
        error = item_error(item, feature)
        next rejected << { index:, feature_id: item[:feature_id], error: } if error
        candidates << [ index, item, feature ]
      end

      twice = numbers_asked_twice(candidates)
      candidates.reject! do |index, item, feature|
        number = twice[index] or next false
        rejected << { index:, feature_id: feature.id, error: self.class.err(:number_twice, number:) }
      end

      spatial = GeometryCheck.spatial_errors(@map, candidates.filter_map { |index, item, _| [ index, item[:changes][:geometry] ] if item[:changes].key?(:geometry) })

      valid = []
      candidates.each do |index, item, feature|
        if (error = spatial[index])
          rejected << { index:, feature_id: feature.id, error: }
          next
        end
        changes, error = effective_changes(feature, item[:changes])
        if error
          rejected << { index:, feature_id: feature.id, error: }
        elsif changes.empty?
          unchanged << { index:, feature_id: feature.id, reason: self.class.err(:same_as_current) }
        elsif pending[feature.id]&.proposed_changes == changes
          unchanged << { index:, feature_id: feature.id, reason: self.class.err(:already_pending, id: pending[feature.id].id) }
        else
          valid << [ index, item, feature, changes ]
        end
      end
      swaps = number_swaps(valid)

      waiting = @map.feature_update_drafts.pending.count - valid.count { |_, _, feature, _| pending[feature.id] }
      if waiting + valid.size > MAX_PENDING
        raise ToolError, I18n.t("mcp.errors.too_many_pending_updates", max: MAX_PENDING, pending: waiting)
      end

      created = create(batch, valid, pending, swaps)
      Outcome.new(batch:, created:, unchanged:, rejected: rejected.sort_by { |r| r[:index] })
    end

    private
      # The plant number each candidate asks for, when another candidate
      # asks for the same one: { index => number }.
      def numbers_asked_twice(candidates)
        asked = candidates.filter_map do |index, item, _|
          number = item[:changes].dig(:properties, :number) || item[:changes].dig("properties", "number")
          [ index, number.to_i ] if number.to_s.match?(/\A\d{1,9}\z/)
        end
        counts = asked.map(&:last).tally
        asked.select { |_, number| counts[number] > 1 }.to_h
      end

      # For each valid change of number, the plant that holds that number
      # today when it is not renumbered by this proposal too: it will take
      # the number the changed plant leaves. { index => { feature_id:, number: } }
      def number_swaps(valid)
        renumbered = valid.filter_map { |_, _, feature, changes| feature.id if changes.dig("properties", "number") }
        valid.each_with_object({}) do |(index, _, feature, changes), out|
          number = changes.dig("properties", "number") or next
          holder = @map.features.where(kind: PlantableFeature::PLANT).where.not(id: [ feature.id, *renumbered ]).where.not(status: "rejected")
                       .where("#{MapFeature::PlantNumber::NUMBER_SQL} = ?", number.to_i).pick(:id)
          out[index] = { feature_id: holder, takes_number: feature.plant_number } if holder
        end
      end

      def item_error(item, feature)
        return self.class.err(:not_found, id: item[:feature_id]) unless feature
        return self.class.err(:not_active, status: feature.status) unless feature.status == "active"
        return self.class.err(:networks) if feature.layer == "networks"
        return self.class.err(:rationale) if item[:rationale].to_s.strip.length < 10
        error = self.class.changes_error(item[:changes])
        return error if error
        if item[:changes].key?(:geometry)
          return I18n.t("mcp.errors.no_boundary") if @map.boundary.nil?
          new_type = GeometryCheck.parse(item[:changes][:geometry])&.geometry_type
          if feature.geometry && new_type != feature.geometry.geometry_type
            return self.class.err(:geometry_type, type: feature.geometry.geometry_type.type_name)
          end
        end
        nil
      end

      # Applies the changes in memory, lets the element normalize and
      # validate them, keeps only what differs from it, then puts it back.
      # Returns [changes, error].
      def effective_changes(feature, raw)
        raw = raw.deep_stringify_keys
        %w[name notes].each { |field| raw[field] = raw[field].to_s.strip.presence if raw.key?(field) }
        before = FeatureUpdateDraft.snapshot(feature, raw)
        FeatureUpdateDraft.assign(feature, raw)
        feature.swap_number = raw["properties"].is_a?(Hash) && raw["properties"].key?("number")
        unless feature.valid?
          return [ nil, self.class.err(:invalid, errors: feature.errors.full_messages.to_sentence) ]
        end
        after = FeatureUpdateDraft.snapshot(feature, raw)
        changes = raw.keys.each_with_object({}) do |field, out|
          if field == "properties"
            keys = raw["properties"].keys.reject { |key| after["properties"][key] == before["properties"][key] }
            out["properties"] = keys.index_with { |key| after["properties"][key] } if keys.any?
          elsif after[field] != before[field]
            out[field] = after[field]
          end
        end
        [ changes, nil ]
      ensure
        feature.restore_attributes
        feature.swap_number = false
        feature.errors.clear
      end

      def create(batch, valid, pending, swaps)
        return [] if valid.empty?
        FeatureUpdateDraft.transaction do
          replaced = valid.filter_map { |_, _, feature, _| pending[feature.id]&.id }
          FeatureUpdateDraft.where(id: replaced).update_all(status: "withdrawn", updated_at: Time.current) if replaced.any?
          valid.map do |index, item, feature, changes|
            draft = @map.feature_update_drafts.create!(
              map_feature: feature, batch:, summary: @summary, proposed_changes: changes,
              rationale: item[:rationale].to_s.strip.first(2000),
              created_by: @user, client_name: @client_name&.first(100)
            )
            { index:, id: draft.id, feature_id: feature.id, name: feature.name, diff: draft.diff(feature), replaces: pending[feature.id]&.id, swaps_with: swaps[index] }.compact
          end
        end
      end
  end
end

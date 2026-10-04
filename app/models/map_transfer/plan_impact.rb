class MapTransfer
  # What taking a map over would change for the recipient's plan, shown before
  # they accept. Same rule as Map#read_only_by_plan?: an owner's oldest active
  # maps stay editable, up to the plan's max_maps, so the map taken over can
  # itself be over the limit, or push one of the recipient's newer maps over
  # it (it keeps its creation date). Paid features follow the owner's plan.
  # Nothing is ever deleted. With billing off (beta) nothing changes.
  class PlanImpact
    FEATURES = %i[pdf_export analyses ai_drafts].freeze

    def initialize(map, recipient)
      @map = map
      @recipient = recipient
    end

    def billing? = Billing.enabled?

    def entitlements = @entitlements ||= Entitlements.for(@recipient)

    # The map taken over would be read-only for its new owner.
    def map_read_only?
      billing? && editable_after.exclude?(@map.id)
    end

    # The recipient's maps editable today that would become read-only.
    def maps_becoming_read_only
      return Map.none unless billing?
      @recipient.owned_maps.active.where(id: editable_now - editable_after).order(:created_at, :id)
    end

    # Paid features available on the map today that the recipient's plan does not include.
    def lost_features
      return [] unless billing?
      current = Entitlements.for_map(@map)
      FEATURES.select { |feature| current.public_send(:"#{feature}?") && !entitlements.public_send(:"#{feature}?") }
    end

    def changes_anything?
      map_read_only? || maps_becoming_read_only.exists? || lost_features.any?
    end

    def as_json(*)
      {
        billing: billing?,
        plan: entitlements.plan,
        planName: I18n.t("transfer.impact.plan_names.#{entitlements.plan}"),
        maxMaps: entitlements.max_maps,
        mapReadOnly: map_read_only?,
        mapsBecomingReadOnly: maps_becoming_read_only.map { |m| { id: m.id, name: m.name } },
        lostFeatures: lost_features.map(&:to_s),
        changesAnything: changes_anything?
      }
    end

    private
      def editable_now
        @editable_now ||= @recipient.owned_maps.active.order(:created_at, :id).limit(entitlements.max_maps).pluck(:id)
      end

      def editable_after
        @editable_after ||= Map.active.where(owner_id: @recipient.id).or(Map.active.where(id: @map.id))
          .order(:created_at, :id).limit(entitlements.max_maps).pluck(:id)
      end
  end
end

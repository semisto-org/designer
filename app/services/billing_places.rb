# What a plan does for the payer's places, for the top of « Formule et
# facturation »: the active maps it covers (by name, the ones beyond the
# limit marked read-only), the archived ones, this month's images, and which
# map would stay editable on the free plan (« Et si j'arrête ? »).
# Presentation only: the rules stay in Billing::Scope and Entitlements.
class BillingPlaces
  LISTED = 40

  def initialize(user)
    @user = user
  end

  def as_json(*)
    maps = scope.maps.order(:created_at, :id).limit(LISTED).to_a
    editable = scope.editable_map_ids.to_set
    outlines = MapSketch.new(maps).outlines
    {
      maps: maps.map { |map| map_json(map, editable, outlines) },
      activeCount: scope.maps.count,
      archivedCount: @user.archived_billed_maps.count,
      renderings: { used: PhotoRendering.used_this_month(@user), limit: entitlements.renderings_per_month },
      # On the free plan, the oldest active map stays editable (a team's maps
      # go back to their owners' plans instead).
      keptOnFree: (maps.first&.then { |map| { id: map.id, name: map.name } } unless @user.pays_for_teams?),
      freeMaxMaps: Entitlements::PLANS.dig("free", :max_maps),
      freeStorageBytes: Entitlements::PLANS.dig("free", :storage_gb) * 1.gigabyte
    }
  end

  private
    def scope = @scope ||= Billing::Scope.new(@user)
    def entitlements = scope.entitlements

    def map_json(map, editable, outlines)
      {
        id: map.id, name: map.name, areaM2: map.area_m2&.round,
        readOnly: Billing.enabled? && editable.exclude?(map.id),
        boundary: outlines.dig(map.id, :boundary)
      }
    end
end

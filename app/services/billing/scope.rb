# Which maps share one plan's limits (active maps, storage), and which plan
# applies to them. A user's plan covers their own maps. Once they pay for a
# team (Organization#billing_user), it covers the maps of the teams they pay
# for, and their own maps outside those teams follow the free plan on their
# own (decided with Michael, 2026-10-19): paying for a team does not turn
# the payer's personal maps into team maps.
module Billing
  class Scope
    attr_reader :payer

    # The scope a map falls in: its team's, when someone pays for the team,
    # else its owner's own maps.
    def self.for_map(map)
      team_payer = map.organization&.billing_user
      team_payer ? new(team_payer) : own(map.owner)
    end

    # The scope of a user's own maps (outside teams someone pays for).
    def self.own(user) = new(user, personal: user.pays_for_teams?)

    # The scope a new map of `user` would fall in: the team's plan when it
    # goes into a team someone pays for, else the user's own maps.
    def self.for_new_map(user, team: nil)
      team_payer = team&.billing_user
      team_payer ? new(team_payer) : own(user)
    end

    # personal: the payer's own maps under the free plan, apart from the
    # teams their plan pays for.
    def initialize(payer, personal: false)
      @payer = payer
      @personal = personal
    end

    def personal? = @personal

    def maps(archived: false)
      personal? ? payer.own_billed_maps(archived:) : payer.billed_maps(archived:)
    end

    def entitlements
      @entitlements ||= personal? ? Entitlements.new("free", payer) : Entitlements.for(payer)
    end

    def can_create_map? = !Billing.enabled? || maps.count < entitlements.max_maps

    # The oldest active maps stay editable, up to the plan's max_maps.
    def editable_map_ids = maps.order(:created_at, :id).limit(entitlements.max_maps).pluck(:id)

    def read_only_maps_count
      return 0 unless Billing.enabled?
      [ maps.count - entitlements.max_maps, 0 ].max
    end

    def storage = StorageUsage.new(payer, scope: self)
  end
end

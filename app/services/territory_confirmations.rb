# « À confirmer avec… »: what a territory's dossier waits to hear from each
# actor, grouped by actor, to take to a meeting (printed on A4 with the
# team's charter, or saved as PDF by the browser), and what nobody can
# confirm but the land itself, to go and see.
#
# A team reads a commune at the desk; most do not know it. Every expectation,
# sub-basin, marker and lead starts « vu au bureau » (TerritoryItem
# verification) and names, when it can, the actor who knows (`confirm_with_id`)
# and what to ask them (`confirm_question`). Once that actor confirmed it, it
# leaves their list by itself.
#
# Three lists:
# - by_actor: per actor, the kept entries waiting for their opinion, most
#   loaded actor first; `actor_id` keeps one sheet only.
# - to_visit: what is placed on the map, still seen only at the desk, and
#   waits for no one: the land answers (« à aller voir sur place »).
# - unassigned: the rest at the desk, with nobody named yet to ask.
class TerritoryConfirmations
  KIND_ORDER = %w[lead marker expectation basin].freeze

  def initialize(territory, actor_id: nil)
    @territory = territory
    @actor_id = actor_id.presence&.to_i
    @items = territory.items.kept.order(:created_at).to_a
  end

  def actors = @actors ||= @items.select { |item| item.kind == "actor" }.index_by(&:id)
  def basins = @basins ||= @items.select { |item| item.kind == "basin" }.index_by(&:id)

  def claims
    @claims ||= @items.select(&:verifiable?).sort_by { |item| [ KIND_ORDER.index(item.kind), item.created_at ] }
  end

  def waiting = claims.select { |item| item.prop(:confirm_with_id).present? && actors.key?(item.prop(:confirm_with_id)) }

  def by_actor
    groups = waiting.group_by { |item| item.prop(:confirm_with_id) }
    groups = groups.slice(@actor_id) if @actor_id
    groups.map { |id, items| { actor: actor_json(actors[id]), items: items.map { |item| entry(item) } } }
          .sort_by { |group| [ -group[:items].size, group[:actor][:title].downcase ] }
  end

  def to_visit
    desk_alone.select(&:geometry).map { |item| entry(item) }
  end

  def unassigned
    desk_alone.reject(&:geometry).map { |item| entry(item) }
  end

  def counts
    { waiting: waiting.size, toVisit: desk_alone.count(&:geometry), unassigned: desk_alone.count { |item| item.geometry.nil? },
      confirmed: claims.count { |item| item.verification_level == "actor" }, seen: claims.count { |item| item.verification_level == "site" },
      desk: claims.count { |item| item.verification_level == "desk" } }
  end

  def as_inertia
    {
      territory: @territory.as_inertia.slice(:id, :name, :teamName, :areaM2),
      generatedOn: Date.current.iso8601,
      actorId: @actor_id,
      byActor: by_actor,
      toVisit: @actor_id ? [] : to_visit,
      unassigned: @actor_id ? [] : unassigned,
      actors: actors.values.sort_by { |item| item.title.downcase }.map { |item| actor_json(item) },
      counts:
    }
  end

  # The same lists for an AI (MCP get_territory `to_confirm`), in its words.
  def as_mcp
    {
      by_actor: by_actor.map { |group| { actor_id: group[:actor][:id], actor: group[:actor][:title], items: group[:items].map { |i| mcp_entry(i) } } },
      to_visit: to_visit.map { |i| mcp_entry(i) },
      unassigned: unassigned.map { |i| mcp_entry(i) },
      counts: counts.transform_keys { |key| key.to_s.underscore }
    }
  end

  private
    def desk_alone
      @desk_alone ||= claims.select { |item| item.verification_level == "desk" && item.prop(:confirm_with_id).blank? }
    end

    def actor_json(item)
      { id: item.id, title: item.title, organization: item.prop(:organization), function: item.prop(:function),
        contact: item.prop(:contact), metOn: item.prop(:met_on) }
    end

    def entry(item)
      point = item.geometry&.then { |g| g.geometry_type == RGeo::Feature::Point ? g : g.point_on_surface }
      {
        id: item.id, kind: item.kind, title: item.title, body: item.body,
        question: item.prop(:confirm_question), level: item.verification_level,
        basin: basins[item.prop(:basin_id)]&.title,
        land: (item.prop(:land) || "unknown" if item.kind == "lead"),
        occurredLabel: (item.occurred_label if item.kind == "marker"),
        point: point && [ point.x.round(6), point.y.round(6) ],
        lockVersion: item.lock_version
      }
    rescue RGeo::Error::RGeoError
      entry_without_point(item)
    end

    def entry_without_point(item)
      { id: item.id, kind: item.kind, title: item.title, body: item.body, question: item.prop(:confirm_question),
        level: item.verification_level, basin: basins[item.prop(:basin_id)]&.title, point: nil, lockVersion: item.lock_version }
    end

    def mcp_entry(entry)
      { item_id: entry[:id], kind: entry[:kind], title: entry[:title], question: entry[:question], level: entry[:level],
        basin: entry[:basin], point: entry[:point] }.compact
    end
end

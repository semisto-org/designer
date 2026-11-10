# The « carnet du territoire », read from a territory's dossier, in five
# parts: what the territory says, what the map shows, what was seen on site,
# the layout leads, where to start; it ends with a decision in principle
# (each lead retained, postponed or dismissed, with its reason and date)
# and the next step's budget.
#
# Two versions:
# - working (« carnet de travail »), for the collège communal: every kept
#   lead, those not yet seen on site listed apart as hypotheses, never on
#   the map; a lead on farmland is left out until the farmer was met and
#   answered (only their number shows).
# - public: leads seen on site only, no outline on private or agricultural
#   land, and only the markers seen on site or confirmed.
#
# Leads come soil practices first, then slowing water upstream, then
# structures: the parcel is the first retention work.
class TerritoryNotebook
  VERSIONS = %w[working public].freeze

  def initialize(territory, version: "working")
    @territory = territory
    @version = VERSIONS.include?(version) ? version : "working"
    @items = territory.items.kept.with_attached_file.order(:created_at).to_a
  end

  def public? = @version == "public"

  def as_inertia
    {
      version: @version,
      territory: @territory.as_inertia.slice(:id, :name, :areaM2, :bbox, :boundary, :teamName, :region, :boundarySource),
      intro: @territory.notebook_text(:intro),
      generatedOn: Date.current.iso8601,
      says: { actors: of(:actor).map { |item| actor(item) }, expectations: of(:expectation).map { |item| expectation(item) } },
      shows: { markers: markers.map { |item| marker(item) } },
      seen: { markers: markers.select { |item| %w[seen confirmed].include?(item.prop(:proof)) }.map { |item| marker(item) },
              leads: leads.select(&:seen_on_site?).map { |item| { id: item.id, title: item.title, seenOn: item.prop(:seen_on) } } },
      leads: leads.select(&:seen_on_site?).map { |item| lead(item) },
      hypotheses: public? ? [] : leads.reject(&:seen_on_site?).map { |item| lead(item).except(:geometry) },
      waitingForFarmer: public? ? 0 : of(:lead).count(&:waiting_for_farmer?),
      firstSteps: leads.select { |item| (!public? || item.seen_on_site?) && item.prop(:first_step).to_i.between?(1, 3) }.sort_by { |item| item.prop(:first_step).to_i }
                       .map { |item| { id: item.id, title: item.title, order: item.prop(:first_step), thisWinter: item.prop(:this_winter) == true } },
      decision: { nextStep: @territory.notebook_text(:next_step), budget: @territory.notebook_text(:next_step_budget) },
      sources: of(:source).map { |item| source(item) },
      mapFeatures: map_features
    }
  end

  private
    def of(kind) = @items.select { |item| item.kind == kind.to_s }

    # The public version leaves out a lead its farmer or owner refused or is
    # still weighing, and a soil practice on farmland until the farmer said
    # yes: publishing it would answer for them.
    def leads
      @leads ||= of(:lead).reject { |item| item.waiting_for_farmer? || (public? && held_from_public?(item)) }
                          .sort_by { |item| [ TerritoryItem::RANKS.index(item.prop(:rank)) || TerritoryItem::RANKS.size, item.created_at ] }
    end

    def markers
      @markers ||= of(:marker).select { |item| !public? || %w[seen confirmed].include?(item.prop(:proof)) }
    end

    def sources_by_id = @sources_by_id ||= of(:source).index_by(&:id)

    def source_refs(ids)
      Array(ids).filter_map { |id| sources_by_id[id] }.map { |item| { id: item.id, title: item.title, url: item.prop(:url), author: item.prop(:author), publishedOn: item.prop(:published_on) } }
    end

    def actor(item)
      { id: item.id, title: item.title, body: item.body, organization: item.prop(:organization), function: item.prop(:function), metOn: item.prop(:met_on) }
    end

    def expectation(item)
      { id: item.id, title: item.title, body: item.body, year: item.prop(:year), validated: item.prop(:validated) == true, sources: source_refs(item.prop(:source_ids)) }
    end

    def marker(item)
      { id: item.id, title: item.title, body: item.body, occurredOn: item.prop(:occurred_on), proof: item.prop(:proof) || "computed",
        markerKind: item.prop(:marker_kind), sources: source_refs(item.prop(:source_ids)) }
    end

    def source(item)
      { id: item.id, title: item.title, url: item.prop(:url), author: item.prop(:author), publishedOn: item.prop(:published_on),
        sourceKind: item.prop(:source_kind), rights: item.prop(:rights) || "unknown" }
    end

    def lead(item)
      expectations = of(:expectation).index_by(&:id)
      {
        id: item.id, title: item.title, body: item.body,
        rank: item.prop(:rank), theme: item.prop(:theme), land: item.prop(:land) || "unknown", magnitude: item.prop(:magnitude),
        answers: Array(item.prop(:expectation_ids)).filter_map { |id| expectations[id]&.title },
        seenOnSite: item.seen_on_site?, seenOn: item.prop(:seen_on),
        farmer: public? ? nil : item.prop(:farmer),
        keeper: item.prop(:keeper), orphan: item.orphan?,
        decision: item.prop(:decision),
        sharp: item.sharp?,
        geometry: drawable?(item) ? item.geometry_geojson : nil
      }
    end

    def held_from_public?(item)
      %w[no thinking].include?(item.farmer_answer) || (item.soil_practice? && item.farmer_answer != "yes")
    end

    # The public version draws leads on public land only. A lead whose farmer
    # said no is never drawn on their field, nor a soil practice before yes.
    def drawable?(item)
      item.geometry && item.seen_on_site? && item.farmer_answer != "no" &&
        !(item.soil_practice? && item.farmer_answer != "yes") && (!public? || item.prop(:land) == "public")
    end

    def map_features
      features = markers.select(&:geometry).map do |item|
        { type: "Feature", geometry: item.geometry_geojson, properties: { kind: "marker", id: item.id, title: item.title, proof: item.prop(:proof) || "computed" } }
      end
      features + leads.select { |item| drawable?(item) }.map do |item|
        { type: "Feature", geometry: item.geometry_geojson, properties: { kind: "lead", id: item.id, title: item.title, sharp: item.sharp?, rank: item.prop(:rank) } }
      end
    end
end

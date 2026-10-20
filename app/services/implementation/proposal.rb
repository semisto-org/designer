# Semisto's phasing of a design (« Proposer un phasage »), in the order a
# permaculture designer builds a place: water, earthworks and access in the
# dry season, then the hedges, windbreaks and structure trees with the
# nitrogen fixers that will shelter them in the first dormant season, the
# low layers the following spring, and the fruit trees and shrubs the next
# winter, once the support plants are in. A project to be built « in one go »
# (project sheet) plants every woody plant in the first winter.
#
# Only work still to do and not yet in a phase is placed; a phase that would
# stay empty is not created; phases already made by an earlier proposal
# (same key) are reused, so it can run again after new elements are drawn.
#
#   Implementation::Proposal.new(map, today: Date.current).run! # => { created: 3, assigned: 42 }
module Implementation
  class Proposal
    # key => [first month, last month] of its working window.
    WINDOWS = {
      "earth" => [ 8, 10 ],
      "structure" => [ 11, 3 ],
      "understory" => [ 4, 5 ],
      "fruit" => [ 11, 3 ]
    }.freeze
    ORDER = WINDOWS.keys.freeze
    # A season that ends sooner than this after today waits for next year.
    MIN_DAYS = 28

    EARTH_STRUCTURES = %w[mound terrace raised_bed compost shed greenhouse shelter fruit_store playground].freeze
    STRUCTURE_KINDS = %w[hedge windbreak fence gate hedge_bank].freeze

    attr_reader :map

    def initialize(map, today: Date.current, by: nil)
      @map = map
      @today = today
      @by = by
    end

    def run!
      plan = Plan.new(map)
      known = plan.phases.map(&:id).to_set
      todo = plan.items.reject { _1.done || known.include?(_1.phase_id) }
      buckets = todo.group_by { bucket(_1, plan.sheet[:phasing]) }
      created = assigned = 0
      ImplementationPhase.transaction do
        cursor = start_date(plan.sheet[:start_year])
        ORDER.each do |key|
          phase = plan.phases.find { _1.key == key }
          items = buckets[key]
          if phase.nil? && items.present?
            starts_on, ends_on = window(key, cursor)
            phase = map.implementation_phases.create!(key:, name: I18n.t("implementation.proposal.phases.#{key}"),
                                                      notes: I18n.t("implementation.proposal.notes.#{key}"), starts_on:, ends_on:)
            created += 1
          end
          cursor = phase.ends_on + 1 if phase
          Array(items).each do |item|
            feature = map.features.find(item.id)
            feature.update!(properties: feature.properties.merge("phase_id" => phase.id), updated_by: @by)
            assigned += 1
          end
        end
      end
      { created:, assigned: }
    end

    private
      def bucket(item, phasing)
        case item.layer
        when "water" then item.kind == "hedge_bank" ? "structure" : "earth"
        when "access", "networks" then "earth"
        when "animals" then phasing == "one_go" ? "structure" : "fruit"
        when "structures"
          return "structure" if STRUCTURE_KINDS.include?(item.kind)
          EARTH_STRUCTURES.include?(item.kind) ? "earth" : "structure"
        else
          plant_bucket(item, phasing)
        end
      end

      def plant_bucket(item, phasing)
        return "understory" unless Plan::WOODY_STRATA.include?(item.strata)
        return "structure" if phasing == "one_go" || item.nitrogen || item.strata == "canopy"
        "fruit"
      end

      # The project sheet's start year when it lies ahead, else today.
      def start_date(start_year)
        start_year.to_i > @today.year ? Date.new(start_year.to_i, 1, 1) : @today
      end

      # The first window of that season that still leaves MIN_DAYS of work
      # after `from`; a window already under way starts on `from`.
      def window(key, from)
        first, last = WINDOWS.fetch(key)
        [ from.year - 1, from.year, from.year + 1 ].each do |year|
          starts_on = Date.new(year, first, 1)
          ends_on = Date.new(last < first ? year + 1 : year, last, 1).end_of_month
          next if ends_on < from + MIN_DAYS
          return [ [ starts_on, from ].max, ends_on ]
        end
      end
  end
end

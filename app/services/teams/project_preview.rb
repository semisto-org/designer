# What the team reads about one of its projects before opening its map
# (« Aperçu du projet », opened from a card of the team board): where it
# stands on the timeline and in its task lists, what was done lately, the
# next action and who carries it, the people on it, the date promised to
# the client, its season steps, how far the offer went (never its amount:
# the board shows progress, not money) and the request it came from.
#
# Read by the board (Teams::BoardProjectsController#preview) and by the
# MCP (get_map, team_project), so a team's AI tells the same story.
module Teams
  class ProjectPreview
    # The latest ticked tasks shown under « Déjà fait ».
    DONE_SHOWN = 5
    # The pending tasks shown after the next action.
    COMING_SHOWN = 3

    attr_reader :map

    def initialize(map, user, today: Date.current)
      @map = map
      @user = user
      @today = today
    end

    def as_json(*)
      {
        id: map.id, name: map.name, address: map.address, areaM2: map.area_m2,
        phase: map.board_phase,
        phaseChangedAt: (map.phase_changed_at || map.created_at).iso8601,
        daysInPhase: (@today - (map.phase_changed_at || map.created_at).to_date).to_i.clamp(0..),
        onHoldSince: map.on_hold_since&.iso8601,
        closedAt: map.closed_at&.iso8601,
        closedReason: map.closed_reason,
        promisedOn: map.promised_on&.iso8601,
        promisedWhat: map.promised_what,
        lead: map.lead && person(map.lead),
        crew: map.crew.reject { |u| u.id == map.lead_id }.sort_by(&:display_name).map { |u| person(u) },
        nextStep: next_step && task_json(next_step),
        coming: coming.map { |task| task_json(task) },
        overdue: pending.count { |task| task.due_on && task.due_on < @today },
        done: done.map { |task| task_json(task) },
        lists: lists,
        steps: steps.map { |task| Teams::Board.step_json(task) },
        mainGoal: main_goal,
        offer: offer,
        request: request,
        readOnly: map.read_only_by_plan?
      }
    end

    # The same, for an AI (snake_case, labels instead of keys).
    def for_mcp
      data = as_json
      {
        stage: data[:phase], stage_label: I18n.t("team_board.phases.#{data[:phase]}"), days_in_stage: data[:daysInPhase],
        on_hold_since: data[:onHoldSince], closed_at: data[:closedAt], closed_reason: data[:closedReason],
        promised_on: data[:promisedOn], promised_what: data[:promisedWhat],
        project_manager: data[:lead]&.slice(:id, :name), crew: data[:crew].map { _1.slice(:id, :name) },
        next_action: data[:nextStep] && mcp_task(data[:nextStep]),
        coming_actions: data[:coming].map { mcp_task(_1) },
        overdue_actions: data[:overdue],
        recently_done: data[:done].map { mcp_task(_1) },
        task_lists: data[:lists].map { { name: _1[:name], done: _1[:done], total: _1[:total] } },
        offer: data[:offer] && data[:offer].transform_keys { _1.to_s.underscore.to_sym },
        request_received_on: data.dig(:request, :createdAt)&.slice(0, 10)
      }.compact
    end

    private
      def person(user) = { id: user.id, name: user.display_name, avatarUrl: user.avatar_url }

      # Actions, not season steps: those are calendar spans, shown apart.
      def tasks
        @tasks ||= map.tasks.where(step_kind: nil).includes(:assignee, :completed_by, :task_list).to_a
      end

      def pending
        @pending ||= tasks.reject(&:done?)
      end

      # The board's next step (MapBoard#next_step_task): the first pending task with a date.
      def next_step
        @next_step ||= pending.select(&:due_on).min_by { |t| [ t.due_on, t.position.to_i, t.id ] }
      end

      # What comes after it: the other dated tasks, then the undated ones of its list order.
      def coming
        rest = pending - [ next_step ]
        dated, undated = rest.partition(&:due_on)
        (dated.sort_by { |t| [ t.due_on, t.position.to_i, t.id ] } +
          undated.select(&:assigned?).sort_by { |t| [ t.position.to_i, t.id ] }).first(COMING_SHOWN)
      end

      def done
        tasks.select(&:done?).sort_by { |t| [ t.completed_at, t.id ] }.last(DONE_SHOWN).reverse
      end

      def task_json(task)
        {
          id: task.id, title: task.title, dueOn: task.due_on&.iso8601,
          overdue: task.overdue?(@today), list: task.task_list&.name,
          assignee: task.assignee ? person(task.assignee) : (task.invitee_email && { id: nil, name: task.invitee_email, avatarUrl: nil }),
          completedAt: task.completed_at&.iso8601, completedBy: task.completed_by&.display_name
        }
      end

      def mcp_task(task)
        { task_id: task[:id], title: task[:title], due_on: task[:dueOn], overdue: (task[:overdue] || nil), list: task[:list],
          assignee: task.dig(:assignee, :name), completed_at: task[:completedAt], completed_by: task[:completedBy] }.compact
      end

      # Each task list but the season's, with how much of it is done. A
      # default task the map already shows done (Journey) counts as done.
      def lists
        said_done = journey_done
        by_list = tasks.group_by(&:task_list_id)
        map.task_lists.reject { _1.key == TaskList::SEASON_KEY }.filter_map do |list|
          own = by_list.fetch(list.id, [])
          next if own.empty?
          done = own.count { |t| t.done? || said_done.include?(TaskList::Defaults.journey_for(t.key)) }
          { id: list.id, name: list.name, done:, total: own.size }
        end
      end

      def journey_done
        return [] unless tasks.any?(&:key)
        Journey.new(map).items.select(&:done).map(&:key)
      rescue StandardError => e
        # The journey reads many areas of the map; the preview must not fail with it.
        Rails.error.report(e, handled: true)
        []
      end

      # The season steps of the project from the start of this month.
      def steps
        map.tasks.steps.where(due_on: @today.beginning_of_month..).order(:starts_on, :id).to_a
      end

      def main_goal
        key = map.project_sheet.section("ambitions")["main_goal"].presence
        key && I18n.t("journey.project.sections.ambitions.fields.goals.options.#{key}", default: nil)
      rescue StandardError
        nil
      end

      # How far the offer went: its latest version and that version's
      # status (saved, sent, accepted, declined). No amount.
      def offer
        return nil unless Offer.shown_to?(map, @user)
        offer = map.offer
        latest = offer&.versions&.max_by(&:number)
        {
          url: "/maps/#{map.id}/offer",
          exists: offer.present?,
          version: latest&.label,
          status: latest&.status,
          statusOn: latest&.updated_at&.to_date&.iso8601,
          versions: offer ? offer.versions.size : 0
        }
      end

      # The request of the team's form the map was made from, if any.
      def request
        r = ProjectRequest.where(map_id: map.id).order(:created_at).first
        r && { createdAt: r.created_at.iso8601, name: r.name }
      end
  end
end

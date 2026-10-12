module Teams
  # The team board (« Tableau de l'équipe »), read at the team's operational
  # meeting, top to bottom:
  #
  # 1. two figures: requests left unanswered for more than a week, and the
  #    season's plantings that are ready (design done) out of those planned;
  # 2. the new requests of the team's form, the oldest first;
  # 3. every team map on one timeline, from request to completion, with who
  #    leads it, who works on it, its next step (a dated task) and the date
  #    promised to the client;
  # 4. the season: design, work site and planting steps over twelve months;
  # 5. who carries what.
  #
  # A few grouped queries for the whole team, never one per map.
  class Board
    UNANSWERED_DAYS = 7
    # « Qui porte quoi » counts the tasks due within these coming days.
    LOAD_DAYS = 28
    # Bare-root planting: 1 November to 31 March.
    PLANTING_OPENS = [ 11, 1 ].freeze
    PLANTING_CLOSES = [ 3, 31 ].freeze
    READY_PHASES = %w[implementation co_management completed].freeze

    def initialize(team, user, today: Date.current)
      @team = team
      @user = user
      @today = today
    end

    def as_json(*)
      {
        team: { id: @team.id, name: @team.name, role: @team.role_for(@user) },
        today: @today.iso8601,
        season: season_json,
        figures: figures,
        requestForm: form && { id: form.id, slug: form.slug, active: form.active },
        requests: requests.map { |r| request_json(r) },
        **settings,
        projects: maps.map { |map| project_json(map) },
        steps: steps.map { |task| step_json(task) },
        people: people
      }
    end

    # The board's view of one map, after a change from the board.
    def project(map) = project_json(map)

    # What the project settings need besides the project (map editor).
    def settings
      { members: members_json, phases: MapBoard::PHASES, closedReasons: MapBoard::CLOSED_REASONS, stepKinds: Task::STEP_KINDS }
    end

    def self.step_json(task)
      { id: task.id, mapId: task.map_id, kind: task.step_kind, title: task.title,
        startsOn: task.starts_on.iso8601, dueOn: task.due_on.iso8601, done: task.done? }
    end

    private
      def form = defined?(@form) ? @form : (@form = RequestForm.find_by(owner: @team))

      # Requests nobody has turned into a map or declined yet.
      def requests
        @requests ||= form ? form.project_requests.where(map_id: nil).where(status: %w[new called visited offer_sent])
                                 .order(:created_at, :id).with_attached_photos.to_a : []
      end

      def maps
        @maps ||= @team.maps.active.includes(:owner, :region, :lead, :crew).order(:name, :id).to_a
      end

      def ids = maps.map(&:id)

      def memberships
        @memberships ||= @team.memberships.includes(:user).to_a
      end

      def person(user) = { id: user.id, name: user.display_name, avatarUrl: user.avatar_url }

      def members_json
        memberships.map(&:user).sort_by { |u| u.display_name.downcase }.map { |u| person(u).merge(you: u.id == @user.id) }
      end

      def sketches = @sketches ||= MapSketch.for(maps)

      def project_json(map)
        step = next_steps[map.id]
        map.as_inertia(@user).merge(
          sketch: sketches[map.id],
          phase: map.board_phase,
          phaseChangedAt: (map.phase_changed_at || map.created_at).iso8601,
          lead: map.lead && person(map.lead),
          crew: map.crew.reject { |u| u.id == map.lead_id }.sort_by(&:display_name).map { |u| person(u) },
          promisedOn: map.promised_on&.iso8601,
          promisedWhat: map.promised_what,
          onHoldSince: map.on_hold_since&.iso8601,
          closedAt: map.closed_at&.iso8601,
          closedReason: map.closed_reason,
          closedNote: map.closed_note,
          nextStep: step && { id: step.id, title: step.title, dueOn: step.due_on.iso8601,
                              assignee: step.assignee && person(step.assignee) },
          overdueTasks: overdue_tasks.fetch(map.id, 0)
        )
      end

      # Each map's first pending task with a date (MapBoard#next_step_task),
      # for every map at once. Season steps are calendar spans, not steps.
      def next_steps
        @next_steps ||= Task.pending.where(map_id: ids, step_kind: nil).where.not(due_on: nil).includes(:assignee)
                            .order(:map_id, :due_on, :position, :id).to_a.group_by(&:map_id).transform_values(&:first)
      end

      def overdue_tasks
        @overdue_tasks ||= Task.pending.where(map_id: ids, step_kind: nil).where(due_on: ...@today).group(:map_id).count
      end

      # The steps drawn on the twelve months from the start of this month.
      def steps
        from = @today.beginning_of_month
        @steps ||= Task.steps.where(map_id: ids).where(due_on: from..).where(starts_on: ..(from + 12.months))
                       .order(:starts_on, :id).to_a
      end

      def step_json(task) = self.class.step_json(task)

      # This season's or the coming season's planting window.
      def season
        @season ||= begin
          closes_this_year = Date.new(@today.year, *PLANTING_CLOSES)
          if @today <= closes_this_year
            Date.new(@today.year - 1, *PLANTING_OPENS)..closes_this_year
          else
            Date.new(@today.year, *PLANTING_OPENS)..Date.new(@today.year + 1, *PLANTING_CLOSES)
          end
        end
      end

      def season_json
        in_season = season.cover?(@today)
        {
          opensOn: season.begin.iso8601, closesOn: season.end.iso8601, inSeason: in_season,
          weeks: ((in_season ? season.end - @today : season.begin - @today).to_i / 7.0).ceil
        }
      end

      def figures
        unanswered = requests.count { |r| r.status == "new" && (@today - r.created_at.to_date).to_i > UNANSWERED_DAYS }
        planting = steps.select { |s| s.step_kind == "plant" && s.starts_on <= season.end && s.due_on >= season.begin }
                        .map(&:map_id).uniq
        live = maps.reject(&:closed?).index_by(&:id)
        planned = planting.filter_map { |id| live[id] }
        { unanswered:, plantingsPlanned: planned.size, plantingsReady: planned.count { |m| READY_PHASES.include?(m.board_phase) } }
      end

      def request_json(r)
        {
          id: r.id, formId: r.request_form_id, name: r.name, email: r.email, phone: r.phone, address: r.address,
          areaM2: r.area_m2, message: r.message.to_s.first(400), answers: r.answers, status: r.status,
          createdAt: r.created_at.iso8601, photos: r.photos.size,
          boundary: r.boundary && RGeo::GeoJSON.encode(r.boundary),
          center: r.center && [ r.center.x, r.center.y ]
        }
      end

      # Who carries what: projects led (still followed) and the tasks given
      # to each member on the team's maps for the coming four weeks.
      def people
        tasks = Task.pending.where(map_id: ids).where.not(assignee_id: nil)
        soon = tasks.where(due_on: ..(@today + LOAD_DAYS)).group(:assignee_id).count
        overdue = tasks.where(due_on: ...@today).group(:assignee_id).count
        followed = maps.reject { |m| m.closed? || m.board_phase == "completed" }
        memberships.map(&:user).sort_by { |u| u.display_name.downcase }.map do |user|
          person(user).merge(
            you: user.id == @user.id,
            leads: followed.select { |m| m.lead_id == user.id }.map(&:id),
            works: followed.count { |m| m.lead_id != user.id && m.crew.any? { |c| c.id == user.id } },
            tasksSoon: soon.fetch(user.id, 0),
            overdue: overdue.fetch(user.id, 0)
          )
        end
      end
  end
end

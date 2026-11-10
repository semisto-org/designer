# Everything the « Tâches » view of a map shows: its lists, its tasks, who
# can be assigned, and which default tasks the map already shows done
# (Journey). Writes answer with the whole board: it stays small (dozens of
# tasks), and the view never drifts from the server.
class TaskBoard
  attr_reader :map

  def initialize(map)
    @map = map
  end

  def as_json(*)
    done = journey_done
    tasks = map.tasks.reload.includes(:assignee, :completed_by, :features).order(:position, :id).to_a
    labels = MapFeature.labels_for(tasks.flat_map(&:features).uniq)
    {
      lists: map.task_lists.reload.map(&:as_json),
      tasks: tasks.map { |task| task.as_json(journey_done: done, labels:) },
      seeded: map.tasks_seeded_at.present?
    }
  end

  # The people a task can be given to, in the order the picker shows them:
  # the project's team first (« l'équipe du projet », MapBoard#crew, its
  # lead leading), then the people of the map itself (its owner, editors and
  # viewers: a client may have things to do too), then the rest of the map's
  # team, then the addresses invited to the map or its team who have no
  # account there yet (their tasks wait for them, Task#invitee_email). While
  # a team map's project team is not set, its team comes first. Each person
  # carries their `group` (crew, map, team). Michael, 2026-11-10.
  def participants
    crew_ids = map.organization_id ? map.assignments.pluck(:user_id) : []
    team_ids = map.organization_id ? OrganizationMembership.where(organization_id: map.organization_id).pluck(:user_id) : []
    order = crew_ids.any? ? %w[crew map team] : %w[team map]
    people = map.participants.with_attached_avatar.order(:name, :email_address).map do |user|
      group = if crew_ids.include?(user.id) then "crew"
      elsif team_ids.include?(user.id) then "team"
      else "map"
      end
      { id: user.id, name: user.display_name, role: map.role_for(user), group:, avatarUrl: user.avatar_url,
        lead: (true if user.id == map.lead_id) }.compact
    end
    people = people.sort_by.with_index { |person, i| [ order.index(person[:group]), person[:lead] ? 0 : 1, i ] }
    people + map.invitee_emails.sort.map { |email| { email:, name: email, role: "invited" } }
  end

  private
    def journey_done
      Journey.new(map).items.select(&:done).map(&:key)
    rescue StandardError => e
      # The journey reads many areas of the map; the board must not fail with it.
      Rails.error.report(e, handled: true)
      []
    end
end

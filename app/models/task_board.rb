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
    {
      lists: map.task_lists.reload.map(&:as_json),
      tasks: map.tasks.reload.includes(:assignee, :completed_by).order(:position, :id).map { |task| task.as_json(journey_done: done) },
      seeded: map.tasks_seeded_at.present?
    }
  end

  # The people a task can be given to: everyone who takes part in the map,
  # then the addresses invited to it or to its team who have no account
  # there yet (their tasks wait for them, Task#invitee_email).
  def participants
    people = map.participants.order(:name, :email_address).map do |user|
      { id: user.id, name: user.display_name, role: map.role_for(user) }
    end
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

# « Cette semaine chez toi »: what a map's garden asks for in the coming
# days, for the phone's map screen. The week's forecast with its frost and
# heat alerts (Climate::ForecastReport, which names the plants a frost
# would reach), the month's season card of the help center, what the
# plants placed on the map do this month according to the catalogue
# (flowering, harvest, pruning) and the map's tasks due within a week or
# late. Output keys are camelCase (JSON for the app).
class WeekReport
  DAYS_AHEAD = 7
  PLANTS_SHOWN = 6
  TASKS_SHOWN = 5
  MONTH_FIELDS = { flowering: :flowering_months, harvest: :harvest_months, pruning: :pruning_months }.freeze

  def initialize(map, today: Date.current, forecast: nil, inventory: nil)
    @map = map
    @today = today
    @inventory = inventory || MapPlantInventory.new(map)
    @forecast = forecast || Climate::ForecastReport.new(map, inventory: @inventory)
  end

  def as_json(*)
    {
      "today" => @today.iso8601,
      "forecast" => @forecast.as_json,
      "season" => season,
      "plants" => plants,
      "tasks" => tasks
    }
  end

  private
    def season
      entry = HelpArticle.season(@today) or return nil
      { "month" => entry[:month], "title" => entry[:title], "body" => entry[:body] }
    end

    # The species placed on the map, by what they do this month.
    def plants
      placed = @inventory.lines.select { _1.placed_count.to_i.positive? && _1.species }
      MONTH_FIELDS.to_h do |key, field|
        lines = placed.select { |line| line.species.respond_to?(field) && Array(line.species.public_send(field)).include?(@today.month) }
        names = lines.map(&:display_name).uniq
        [ key.to_s, { "names" => names.first(PLANTS_SHOWN), "count" => names.size } ]
      end
    end

    def tasks
      due = @map.tasks.pending.where(due_on: ..(@today + DAYS_AHEAD)).order(:due_on, :id).includes(:assignee)
      due.limit(TASKS_SHOWN).map do |task|
        { "id" => task.id, "title" => task.title, "dueOn" => task.due_on.iso8601, "overdue" => task.due_on < @today,
          "assignee" => task.assignee&.display_name }
      end
    end
end

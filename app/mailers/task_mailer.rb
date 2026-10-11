# Tells someone a task of a map was given to them (Maps::TasksController).
class TaskMailer < ApplicationMailer
  def assigned(task, assigner)
    @task = task
    @map = task.map
    @assigner = assigner
    @url = map_tasks_url(@map)
    mail to: task.assignee.email_address,
         subject: t(".subject", assigner: assigner.display_name, map: @map.name)
  end
end

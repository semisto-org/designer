# Tells someone a task of a map was given to them (Maps::TasksController).
# Someone invited who has no account yet (Task#invitee_email) gets the link
# of their invitation instead: the task becomes theirs when they join.
class TaskMailer < ApplicationMailer
  def assigned(task, assigner)
    @task = task
    @map = task.map
    @assigner = assigner
    @invitation_url = invitation_link(task) unless task.assignee
    return if task.assignee.nil? && @invitation_url.nil?
    @url = @invitation_url || map_tasks_url(@map)
    mail to: task.assignee&.email_address || task.invitee_email,
         subject: t(".subject", assigner: assigner.display_name, map: @map.name)
  end

  private
    # The pending invitation of the address, to the map first, else to its team.
    def invitation_link(task)
      if (invitation = task.map.invitations.pending.find_by(email_address: task.invitee_email))
        invitation_url(invitation.token)
      elsif task.map.organization_id &&
            (invitation = OrganizationInvitation.pending.find_by(organization_id: task.map.organization_id, email_address: task.invitee_email))
        accept_team_invitation_url(invitation.token)
      end
    end
end

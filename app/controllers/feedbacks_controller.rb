# POST /feedback — « Un retour ? »: what a person wants to tell us, from any
# page of the app or from the editor (components/feedback/FeedbackDialog).
# Staff read it in « Premières heures » (/admin/first-hours).
class FeedbacksController < ApplicationController
  forbid_while_impersonating
  rate_limit to: 20, within: 1.hour, with: -> { render json: { message: t("feedback.rate_limited") }, status: :too_many_requests }

  def create
    feedback = Current.user.feedbacks.new(params.require(:feedback).permit(:message, :path, :wants_call, :sentry_replay_id))
    feedback.map = readable_map
    if feedback.save
      FeedbackMailer.received(feedback).deliver_later
      render json: { id: feedback.id }, status: :created
    else
      render json: { message: feedback.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end
  end

  private
    # The map the person was on, only if they can open it: the id comes from the browser.
    def readable_map
      map = Map.find_by(id: params.dig(:feedback, :map_id))
      map if map&.role_for(Current.user)
    end
end

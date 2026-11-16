# POST /feedback — « Un retour ? »: what a person wants to tell us, from any
# page of the app or from the editor (components/feedback/FeedbackDialog),
# as JSON or as a form with the screenshot they annotated.
# Staff read and answer it in « Retours » (/admin/feedbacks); the person
# follows it in « Mes retours » (GET /feedback).
class FeedbacksController < ApplicationController
  forbid_while_impersonating
  rate_limit to: 20, within: 1.hour, only: :create, with: -> { render json: { message: t("feedback.rate_limited") }, status: :too_many_requests }

  # « Mes retours »: what the person told Semisto and what became of it.
  def index
    feedbacks = Current.user.feedbacks.newest_first.includes(:map, :handled_by, screenshot_attachment: :blob)
    render inertia: "feedbacks/index", props: {
      feedbacks: feedbacks.map { |feedback| feedback.as_owner_json.merge(repliedBy: feedback.reply.present? ? feedback.handled_by&.display_name : nil) }
    }
  end

  def create
    attributes = params.require(:feedback).permit(:message, :path, :wants_call, :sentry_replay_id, :screenshot, context: Feedback::CONTEXT_KEYS)
    feedback = Current.user.feedbacks.new(attributes.except(:screenshot))
    feedback.map = readable_map
    if (file = attributes[:screenshot]).respond_to?(:content_type)
      # The bytes decide, not the name the browser gave the file.
      return render json: { message: t("feedback.screenshot.invalid") }, status: :unprocessable_entity unless Feedback::SCREENSHOT_TYPES.include?(Marcel::MimeType.for(Pathname(file.path)))
      feedback.screenshot.attach(file)
    end
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

# Staff: « Retours », the triage of « Un retour ? ». Each feedback gets a
# status and, if useful, a few words; the author is told by e-mail and sees
# it in « Mes retours » (FeedbacksController#index).
module Admin
  class FeedbacksController < BaseController
    FILTERS = (%w[awaiting all] + Feedback::STATUSES).freeze

    def index
      filter = FILTERS.include?(params[:status]) ? params[:status] : "awaiting"
      scope = Feedback.newest_first.includes(:user, :map, :handled_by, screenshot_attachment: :blob)
      scope = case filter
      when "awaiting" then scope.awaiting
      when "all" then scope
      else scope.where(status: filter)
      end
      render inertia: "admin/feedbacks/index", props: {
        feedbacks: scope.limit(200).map { |feedback| feedback.as_admin_json.merge(author: { id: feedback.user_id, name: feedback.user.display_name, email: feedback.user.email_address }) },
        counts: counts,
        filter:
      }
    end

    def update
      feedback = Feedback.find(params[:id])
      attributes = params.require(:feedback).permit(:status, :reply, :notify)
      if feedback.answer!(status: attributes[:status], reply: attributes[:reply], by: Current.user, notify: attributes[:notify] != "false" && attributes[:notify] != false)
        redirect_back_or_to admin_feedbacks_path, notice: t("admin.feedbacks.saved"), status: :see_other
      else
        redirect_back_or_to admin_feedbacks_path, alert: feedback.errors.full_messages.to_sentence, status: :see_other
      end
    end

    private
      def counts
        by_status = Feedback.group(:status).count
        Feedback::STATUSES.to_h { |status| [ status, by_status[status].to_i ] }
          .merge("awaiting" => by_status.values_at(*%w[received reviewing planned]).sum(&:to_i), "all" => by_status.values.sum)
      end
  end
end

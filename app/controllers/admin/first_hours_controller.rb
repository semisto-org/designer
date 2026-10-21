# Staff: « Premières heures ». How the people who signed up lately began
# (Admin::FirstHours), what they told us with « Un retour ? », and the Sentry
# replays of the sessions they let us record.
module Admin
  class FirstHoursController < BaseController
    PERIODS = [ 7, 30, 90 ].freeze

    def show
      days = PERIODS.include?(params[:days].to_i) ? params[:days].to_i : 30
      render inertia: "admin/first_hours/show", props: {
        days:,
        periods: PERIODS,
        report: Admin::FirstHours.call(since: days.days.ago),
        feedbacks: Feedback.newest_first.includes(:user, :map).limit(50).map { |feedback| feedback_json(feedback) },
        replay: { enabled: SessionReplay.enabled?, perUser: SessionReplay.per_user, linked: SessionReplay.url_for("0" * 32).present? }
      }
    end

    private
      def feedback_json(feedback)
        feedback.as_admin_json.merge(author: { id: feedback.user_id, name: feedback.user.display_name, email: feedback.user.email_address })
      end
  end
end

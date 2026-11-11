# « Se connecter en tant que » (see the Impersonation concern). Starting is
# for admins, on anyone but an admin or oneself, and only with a motive: the
# person asked for help (`request`) or an abuse is reported or suspected
# (`abuse`), plus a short note. Both land in the admin log, as the privacy
# policy promises. The end is the banner's « Revenir à mon compte »
# (ImpersonationsController#destroy).
module Admin
  class ImpersonationsController < BaseController
    MOTIVES = %w[request abuse].freeze
    NOTE_MAX = 500

    def create
      user = User.find(params[:user_id])
      return refuse(t("admin.impersonation.errors.self")) if user == Current.user
      return refuse(t("admin.impersonation.errors.admin")) if user.admin?
      motive = params[:motive].to_s
      note = params[:motive_note].to_s.squish.first(NOTE_MAX)
      return refuse(t("admin.impersonation.errors.motive")) unless MOTIVES.include?(motive) && note.present?
      start_impersonation(user, motive:, motive_note: note)
      redirect_to maps_path, notice: t("admin.impersonation.started", name: user.display_name), status: :see_other
    end

    private
      def refuse(message)
        redirect_back_or_to admin_users_path, alert: message, status: :see_other
      end
  end
end

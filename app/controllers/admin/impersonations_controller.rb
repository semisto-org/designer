# « Se connecter en tant que » (see the Impersonation concern). Starting is
# for admins, on anyone but an admin or oneself; the end is the banner's
# « Revenir à mon compte » (ImpersonationsController#destroy).
module Admin
  class ImpersonationsController < BaseController
    def create
      user = User.find(params[:user_id])
      return refuse(t("admin.impersonation.errors.self")) if user == Current.user
      return refuse(t("admin.impersonation.errors.admin")) if user.admin?
      start_impersonation(user)
      redirect_to maps_path, notice: t("admin.impersonation.started", name: user.display_name), status: :see_other
    end

    private
      def refuse(message)
        redirect_back_or_to admin_users_path, alert: message, status: :see_other
      end
  end
end

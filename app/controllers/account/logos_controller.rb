# /account/logo — a pro account's logo, printed at the top of its maps'
# documents when the map is not in a team that has its own (Map#letterhead).
module Account
  class LogosController < ApplicationController
    forbid_while_impersonating

    def update
      user = Current.user
      file = params.dig(:user, :logo)
      unless file.is_a?(ActionDispatch::Http::UploadedFile)
        return redirect_to account_path, inertia: { errors: { logo: t("logos.errors.missing") } }, status: :see_other
      end

      user.logo = file
      if user.save
        redirect_to account_path, notice: t("logos.saved"), status: :see_other
      else
        redirect_to account_path, inertia: { errors: { logo: user.errors[:logo].first || user.errors.full_messages.first } }, status: :see_other
      end
    end

    def destroy
      Current.user.logo.purge
      redirect_to account_path, notice: t("logos.removed"), status: :see_other
    end
  end
end

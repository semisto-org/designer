# /account/avatar — the picture shown next to my name (navbar, comments,
# sharing, tasks). Removing it falls back to the Google one, or the initial.
module Account
  class AvatarsController < ApplicationController
    forbid_while_impersonating

    def update
      user = Current.user
      file = params.dig(:user, :avatar)
      unless file.is_a?(ActionDispatch::Http::UploadedFile)
        return redirect_to account_path, inertia: { errors: { avatar: t("account.avatar.errors.missing") } }, status: :see_other
      end

      user.avatar = file
      if user.save
        redirect_to account_path, notice: t("account.avatar.saved"), status: :see_other
      else
        redirect_to account_path, inertia: { errors: { avatar: user.errors[:avatar].first || user.errors.full_messages.first } }, status: :see_other
      end
    end

    def destroy
      Current.user.avatar.purge
      redirect_to account_path, notice: t("account.avatar.removed"), status: :see_other
    end
  end
end

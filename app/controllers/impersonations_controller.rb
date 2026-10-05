# « Revenir à mon compte »: ends an impersonation and puts the admin back in
# their own session (see the Impersonation concern). Outside an
# impersonation there is nothing to end: back to the maps.
class ImpersonationsController < ApplicationController
  def destroy
    return redirect_to(maps_path, status: :see_other) unless impersonating?
    user = Current.user
    if end_impersonation(Current.session, reason: "stopped")
      redirect_to admin_users_path(q: user.email_address), notice: t("admin.impersonation.stopped", name: user.display_name), status: :see_other
    else
      redirect_to new_session_path, status: :see_other
    end
  end
end

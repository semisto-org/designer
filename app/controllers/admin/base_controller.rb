# The super admin screens (dashboard, users, impersonation). Admins only:
# anyone else gets a 404, as if the page did not exist.
module Admin
  class BaseController < ApplicationController
    before_action :require_admin!

    private
      def require_admin!
        head :not_found unless Current.user&.admin?
      end
  end
end

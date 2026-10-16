# Super admin: every account, searchable, with its plan and maps, and what
# staff can do with it: sign in as the person, give or take the admin role or
# the catalogue reviewer role.
module Admin
  class UsersController < BaseController
    PER_PAGE = 50

    def index
      query = params[:q].to_s.strip
      scope = User.order(created_at: :desc, id: :desc)
      if query.present?
        like = "%#{User.sanitize_sql_like(query)}%"
        scope = scope.where("users.email_address ILIKE :like OR users.name ILIKE :like", like:)
      end
      total = scope.count
      page = params[:page].to_i.clamp(1, [ (total.to_f / PER_PAGE).ceil, 1 ].max)
      users = scope.offset((page - 1) * PER_PAGE).limit(PER_PAGE).to_a
      render inertia: "admin/users/index", props: {
        users: Admin::UserRow.many(users),
        filters: { q: query },
        pagination: { page:, pages: [ (total.to_f / PER_PAGE).ceil, 1 ].max, total: }
      }
    end

    # Gives or takes the admin role (never one's own: no locking oneself out),
    # or the catalogue reviewer role.
    def update
      user = User.find(params[:id])
      return update_reviewer(user) if params.key?(:catalogue_reviewer)
      return refuse(t("admin.users.errors.self")) if user == Current.user
      admin = ActiveModel::Type::Boolean.new.cast(params[:admin])
      return refuse(t("admin.users.errors.invalid")) if admin.nil?
      if user.admin? != admin
        user.update!(admin:)
        AdminEvent.record!(admin ? "admin_granted" : "admin_revoked", admin: Current.user, target: user, request:)
      end
      redirect_back_or_to admin_users_path, status: :see_other,
        notice: t(admin ? "admin.users.flash.granted" : "admin.users.flash.revoked", name: user.display_name)
    end

    private
      def update_reviewer(user)
        reviewer = ActiveModel::Type::Boolean.new.cast(params[:catalogue_reviewer])
        return refuse(t("admin.users.errors.invalid")) if reviewer.nil?
        if user.catalogue_reviewer? != reviewer
          user.update!(catalogue_reviewer: reviewer)
          AdminEvent.record!(reviewer ? "reviewer_granted" : "reviewer_revoked", admin: Current.user, target: user, request:)
        end
        redirect_back_or_to admin_users_path, status: :see_other,
          notice: t(reviewer ? "admin.users.flash.reviewer_granted" : "admin.users.flash.reviewer_revoked", name: user.display_name)
      end

      def refuse(message)
        redirect_back_or_to admin_users_path, alert: message, status: :see_other
      end
  end
end

# Super admin home: the figures of the service, what needs Semisto's
# attention, the latest sign-ups and maps, and the admin log.
module Admin
  class DashboardController < BaseController
    def show
      render inertia: "admin/dashboard/show", props: {
        stats: Admin::Stats.call,
        recentUsers: Admin::UserRow.many(User.order(created_at: :desc, id: :desc).limit(8).to_a),
        recentMaps: Map.includes(:owner, :region).order(created_at: :desc, id: :desc).limit(8).map { |map| map_json(map) },
        events: AdminEvent.includes(:admin, :target_user).newest_first.limit(20).map(&:as_admin_json)
      }
    end

    private
      def map_json(map)
        { id: map.id, name: map.name, createdAt: map.created_at.iso8601, areaM2: map.area_m2, archived: map.archived_at.present?,
          region: map.region&.name, owner: { id: map.owner_id, name: map.owner.display_name, email: map.owner.email_address } }
      end
  end
end

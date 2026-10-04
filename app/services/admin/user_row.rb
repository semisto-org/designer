# One account as the super admin screens list it.
module Admin
  class UserRow
    def self.many(users)
      ids = users.map(&:id)
      maps = Map.active.where(owner_id: ids).group(:owner_id).count
      users.map { |user| new(user, maps_count: maps[user.id].to_i).as_json }
    end

    def initialize(user, maps_count: nil)
      @user = user
      @maps_count = maps_count
    end

    def as_json(*)
      {
        id: @user.id, name: @user.display_name, email: @user.email_address, avatarUrl: @user.avatar_url,
        admin: @user.admin?, google: @user.google_uid.present?,
        createdAt: @user.created_at.iso8601, lastSignedInAt: @user.last_signed_in_at&.iso8601,
        mapsCount: @maps_count || Map.active.where(owner_id: @user.id).count,
        plan: @user.current_plan_key
      }
    end
  end
end

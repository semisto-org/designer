# The people who own the land a map draws (« propriétaires du lieu »). The
# map's owner picks them among its members and invitees (MapMembership and
# MapInvitation#place_owner); they alone choose whether other gardeners see
# the plants in the ground there (SharedPlantings) and may ask them for
# scions, cuttings or seeds (PropagationRequest).
module MapPlaceOwners
  extend ActiveSupport::Concern

  included do
    has_many :propagation_requests, dependent: :delete_all
    # Asking only makes sense once the plants are shown.
    before_save { self.accepts_propagation_requests = false unless shares_planted_palette }
  end

  def place_owners = User.where(id: memberships.where(place_owner: true).select(:user_id))

  def place_owner?(user) = user.present? && memberships.exists?(user_id: user.id, place_owner: true)

  # Shown to other gardeners: an active map whose owners chose to show it.
  def shares_plantings? = shares_planted_palette && archived_at.nil? && memberships.exists?(place_owner: true)

  def open_to_propagation_requests? = accepts_propagation_requests && shares_plantings?

  # A choice made by the place's owners does not outlive them: once none is
  # left, the plants are no longer shown.
  def withdraw_place_sharing_without_owners!
    return unless shares_planted_palette || accepts_propagation_requests
    return if memberships.exists?(place_owner: true)
    update_columns(shares_planted_palette: false, accepts_propagation_requests: false)
  end
end

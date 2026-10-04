# « Transférer la carte »: the owner proposes the map to one of its editors,
# who accepts or declines within 14 days. On acceptance the recipient becomes
# the owner (the map then follows their plan, Entitlements.for_map) and the
# former owner stays on as an editor, in the recipient's seat. Nothing else
# moves: team, publication, share link, comments, photos, drafts and history
# stay with the map, and nothing is ever deleted.
#
# Recipients: an editor of the map. A member of the map's team edits without
# a seat; they can be chosen too, provided a seat is free for the former
# owner (so the three-editor limit always holds).
class MapTransfer < ApplicationRecord
  EXPIRES_IN = 14.days
  STATUSES = %w[pending accepted declined canceled expired invalidated].freeze
  # Problems that end a proposal for good; :no_seat only waits for a free seat.
  ENDING_PROBLEMS = %i[archived owner_changed not_editor].freeze

  # Raised by accept!, decline! and cancel!, with a French message for the user.
  class Refused < StandardError
    attr_reader :reason

    def initialize(reason, message)
      @reason = reason
      super(message)
    end
  end

  belongs_to :map
  belongs_to :from_user, class_name: "User"
  belongs_to :to_user, class_name: "User"

  validates :status, inclusion: { in: STATUSES }
  validate :can_be_proposed, on: :create

  before_validation(on: :create) { self.expires_at ||= EXPIRES_IN.from_now }

  # Waiting for the recipient's answer (not answered, canceled nor past its date).
  scope :pending, -> { where(status: "pending").where("map_transfers.expires_at > ?", Time.current) }

  # Proposes `map` to `to` on behalf of `from`, its owner, and mails the
  # recipient. Under the map's lock: one pending proposal per map. Raises
  # ActiveRecord::RecordInvalid with a French message on `base`.
  def self.propose!(map:, from:, to:)
    transfer = map.with_lock do
      close_stale(map)
      map.transfers.create!(from_user: from, to_user: to)
    end
    MapTransferMailer.proposed(transfer).deliver_later
    transfer
  end

  # Proposals past their date, or that can no longer be accepted (the
  # recipient left the map…), stop blocking a new one.
  def self.close_stale(map)
    map.transfers.where(status: "pending").find_each do |transfer|
      if transfer.past_date?
        transfer.update!(status: "expired", closed_at: transfer.expires_at)
      elsif transfer.ending_problem
        transfer.update!(status: "invalidated", closed_at: Time.current)
      end
    end
  end

  # The proposals waiting for `user`'s answer, on maps still in use.
  def self.incoming_for(user)
    pending.where(to_user: user).joins(:map).merge(Map.active).includes(:map, :from_user).order(:created_at)
  end

  # pending | accepted | declined | canceled | expired | invalidated
  def state = status == "pending" && past_date? ? "expired" : status
  def pending? = state == "pending"
  def past_date? = expires_at.present? && expires_at <= Time.current

  # Why the recipient cannot accept right now, or nil.
  def problem
    return :archived if map.archived_at?
    return :owner_changed unless map.owner_id == from_user_id
    return :not_editor unless map.role_for(to_user) == "editor"
    :no_seat if seat_needed? && map.editors_count >= Map::MAX_EDITORS
  end

  def ending_problem
    found = problem
    found if ENDING_PROBLEMS.include?(found)
  end

  # The recipient edits through the map's team, without a seat: the former
  # owner will need a free one to stay on as an editor.
  def seat_needed?
    !map.memberships.exists?(user_id: to_user_id, role: "editor")
  end

  # A refusal or problem in plain French, for the recipient or the owner.
  def message_for(reason, audience: :recipient)
    I18n.t("transfer.problems.#{audience}.#{reason}", from: from_user.display_name, to: to_user.display_name,
           map: map.name, count: Map::MAX_EDITORS, date: I18n.l(expires_at.to_date, format: :long))
  end

  # For the maps list: a proposal waiting for the recipient's answer.
  def as_incoming_json
    { id:, mapId: map_id, mapName: map.name, fromName: from_user.display_name, expiresAt: expires_at.iso8601 }
  end

  # The recipient takes the map over. Under the map's lock, the proposal and
  # both roles are checked again; a proposal that can no longer be accepted
  # ends ("invalidated") and Refused is raised.
  def accept!(by:)
    refusal = nil
    map.with_lock do
      lock!
      refusal = refusal_for(by) || problem
      if refusal.nil?
        hand_over!
        update!(status: "accepted", closed_at: Time.current)
      elsif ENDING_PROBLEMS.include?(refusal)
        update!(status: "invalidated", closed_at: Time.current)
      end
    end
    raise Refused.new(refusal, message_for(refusal)) if refusal

    MapTransferMailer.accepted(self).deliver_later
    self
  rescue ActiveRecord::RecordInvalid => e
    # A seat taken meanwhile (MapMembership checks the limit): nothing changed.
    raise unless e.record.is_a?(MapMembership)
    raise Refused.new(:no_seat, message_for(:no_seat))
  end

  # The recipient says no: the map stays its owner's, who gets an e-mail.
  def decline!(by:)
    map.with_lock do
      lock!
      refusal = refusal_for(by)
      raise Refused.new(refusal, message_for(refusal)) if refusal
      update!(status: "declined", closed_at: Time.current)
    end
    MapTransferMailer.declined(self).deliver_later
    self
  end

  # The owner withdraws the proposal before it is answered.
  def cancel!(by:)
    map.with_lock do
      lock!
      refusal = (:not_owner unless by.id == map.owner_id) || (state.to_sym unless pending?)
      raise Refused.new(refusal, message_for(refusal, audience: :owner)) if refusal
      update!(status: "canceled", closed_at: Time.current)
    end
    self
  end

  private
    def refusal_for(user)
      return :not_recipient unless user.id == to_user_id
      state.to_sym unless pending?
    end

    # Owner and editor swap places: the recipient's membership becomes the
    # owner's, the former owner's becomes an editor's (the recipient's seat,
    # so the limit holds; MapMembership refuses a fourth editor). The map row
    # only changes owner: a sharing change, not an edit (no lock_version
    # bump, no reordering of the maps list).
    def hand_over!
      map.memberships.find_or_initialize_by(user_id: to_user_id).update!(role: "owner")
      map.memberships.find_or_initialize_by(user_id: from_user_id).update!(role: "editor")
      map.update_columns(owner_id: to_user_id)
    end

    def can_be_proposed
      return if map.nil? || from_user.nil? || to_user.nil?

      if map.archived_at? then errors.add(:base, :archived)
      elsif map.owner_id != from_user_id then errors.add(:base, :not_owner)
      elsif to_user_id == from_user_id then errors.add(:base, :self)
      elsif map.role_for(to_user) != "editor" then errors.add(:base, :not_editor, name: to_user.display_name)
      elsif map.transfers.where(status: "pending").where.not(id:).exists? then errors.add(:base, :already_pending)
      elsif seat_needed? && map.editor_seats_taken >= Map::MAX_EDITORS
        errors.add(:base, :no_seat, count: Map::MAX_EDITORS, name: to_user.display_name)
      end
    end
end

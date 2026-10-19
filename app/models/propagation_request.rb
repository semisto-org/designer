# A gardener asks the owners of a place for material of a plant they have in
# the ground there (« demande de multiplication »): scions of a medlar
# cultivar, cuttings, seeds… Only for places whose owners show their plants
# and accept requests (MapPlaceOwners). The owners see the request and the
# requester's name, never their address; accepting gives each the other's
# e-mail address, declining closes it politely.
class PropagationRequest < ApplicationRecord
  MATERIALS = %w[scions cuttings seeds division layering plant other].freeze
  STATUSES = %w[pending accepted declined withdrawn].freeze
  # How many requests one person can have waiting at once, all places together.
  MAX_PENDING = 10

  belongs_to :map
  belongs_to :species, class_name: "PlantSpecies"
  belongs_to :variety, class_name: "PlantVariety", optional: true
  belongs_to :requester, class_name: "User"
  belongs_to :answered_by, class_name: "User", optional: true

  normalizes :message, :answer, with: ->(text) { text.to_s.strip.presence }

  validates :material, inclusion: { in: MATERIALS }
  validates :status, inclusion: { in: STATUSES }
  validates :message, presence: true, length: { maximum: 2000 }
  validates :answer, length: { maximum: 2000 }
  validate :variety_of_species
  validate :place_open_to_requests, :plant_in_ground_there, :not_from_the_place, :one_waiting_per_plant, :not_too_many_waiting, on: :create

  scope :pending, -> { where(status: "pending") }
  scope :newest_first, -> { order(created_at: :desc, id: :desc) }
  # The requests to the places this person owns.
  scope :received_by, ->(user) { where(map_id: MapMembership.where(user:, place_owner: true).select(:map_id)) }

  after_create_commit :notify_place_owners

  def pending? = status == "pending"
  def accepted? = status == "accepted"

  def answerable_by?(user) = pending? && map.place_owner?(user)

  def plant_name
    name = species.common_name || species.latin_name
    variety ? "#{name} '#{variety.name}'" : name
  end

  def accept!(user, answer: nil) = answer!(user, "accepted", answer)
  def decline!(user, answer: nil) = answer!(user, "declined", answer)

  def withdraw!
    update!(status: "withdrawn") if pending?
  end

  private
    def answer!(user, status, answer)
      update!(status:, answer:, answered_by: user, answered_at: Time.current)
      PropagationRequestMailer.with(request: self).public_send(status).deliver_later
    end

    def notify_place_owners
      map.place_owners.find_each { |owner| PropagationRequestMailer.with(request: self, owner:).received.deliver_later }
    end

    def variety_of_species
      errors.add(:variety, :invalid) if variety && variety.species_id != species_id
    end

    def place_open_to_requests
      errors.add(:base, :closed) unless map&.open_to_propagation_requests?
    end

    def plant_in_ground_there
      return if map.nil? || species.nil? || errors.any?
      errors.add(:base, :not_in_ground) unless SharedPlantings.in_ground?(map, species_id, variety_id)
    end

    def not_from_the_place
      errors.add(:base, :own_place) if map && requester && map.role_for(requester)
    end

    def one_waiting_per_plant
      return unless requester && map
      errors.add(:base, :already_asked) if PropagationRequest.pending.where(requester:, map:, species_id:, variety_id:).exists?
    end

    def not_too_many_waiting
      errors.add(:base, :too_many) if requester && PropagationRequest.pending.where(requester:).count >= MAX_PENDING
    end
end

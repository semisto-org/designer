# What a user's plan allows. Free: one owned map with everything except the
# paid extras. Paid plans (yearly pass for individuals, Atelier and Bureau
# d'études for professionals) unlock more maps, scaled PDF, analyses and AI
# drafts. Editors invited on a map work with the owner's entitlements.
class Entitlements
  PLANS = {
    "free" => { max_maps: 1, pdf_export: false, analyses: false, ai_drafts: false },
    "yearly" => { max_maps: 10, pdf_export: true, analyses: true, ai_drafts: true },
    "atelier" => { max_maps: 5, pdf_export: true, analyses: true, ai_drafts: true },
    "bureau" => { max_maps: 20, pdf_export: true, analyses: true, ai_drafts: true }
  }.freeze

  attr_reader :plan

  def self.for(user)
    new(user&.respond_to?(:current_plan_key) ? user.current_plan_key : "free", user)
  end

  # Entitlements that apply on a map: the owner's. Team maps too: a map in a
  # team stays its owner's and follows the owner's plan (no team billing yet).
  def self.for_map(map)
    self.for(map.owner)
  end

  def initialize(plan, _user = nil)
    @plan = PLANS.key?(plan) ? plan : "free"
  end

  def max_maps = PLANS[plan][:max_maps]
  def pdf_export? = PLANS[plan][:pdf_export] || unlimited?
  def analyses? = PLANS[plan][:analyses] || unlimited?
  def ai_drafts? = PLANS[plan][:ai_drafts] || unlimited?
  def paid? = plan != "free"

  def can_create_map?(user)
    unlimited? || user.owned_maps.active.count < max_maps
  end

  def as_json(*)
    { plan:, maxMaps: max_maps, pdfExport: pdf_export?, analyses: analyses?, aiDrafts: ai_drafts? }
  end

  private
    # Everything is open while billing is not configured (local dev, beta).
    def unlimited?
      !Billing.enabled?
    end
end

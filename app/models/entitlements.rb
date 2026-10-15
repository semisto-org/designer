# What a user's plan allows. Free: one owned map with everything except the
# paid extras. Paid plans (yearly pass for individuals, Atelier and Bureau
# d'études for professionals, without a map limit) unlock more maps, scaled PDF, analyses, AI
# drafts and « Mettre en image ». Editors invited on a map work with the
# owner's entitlements. A free user also gets AI drafts while their trial runs (AiTrial).
class Entitlements
  # Bureau d'études has no map limit. A number rather than nil keeps every
  # comparison and LIMIT simple; screens show « illimité » from 1 000 up.
  UNLIMITED_MAPS = 10_000

  PLANS = {
    "free" => { max_maps: 1, pdf_export: false, analyses: false, ai_drafts: false, renderings: false, offers: false },
    "yearly" => { max_maps: 10, pdf_export: true, analyses: true, ai_drafts: true, renderings: true, offers: false },
    "atelier" => { max_maps: 5, pdf_export: true, analyses: true, ai_drafts: true, renderings: true, offers: true },
    "bureau" => { max_maps: UNLIMITED_MAPS, pdf_export: true, analyses: true, ai_drafts: true, renderings: true, offers: true }
  }.freeze

  attr_reader :plan

  def self.for(user)
    new(user&.respond_to?(:current_plan_key) ? user.current_plan_key : "free", user)
  end

  # Entitlements that apply on a map: those of the user who pays for it, the
  # team's billing user or else its owner (Map#billing_user).
  def self.for_map(map)
    self.for(map.billing_user)
  end

  def initialize(plan, user = nil)
    @plan = PLANS.key?(plan) ? plan : "free"
    @ai_trial_ends_at = user.ai_trial_ends_at if user.respond_to?(:ai_trial_ends_at)
  end

  def max_maps = PLANS[plan][:max_maps]
  def pdf_export? = PLANS[plan][:pdf_export] || unlimited?
  def analyses? = PLANS[plan][:analyses] || unlimited?
  def ai_drafts? = PLANS[plan][:ai_drafts] || unlimited? || ai_trial?
  # « Mettre en image » on photos (PhotoRendering), within a monthly quota.
  def renderings? = PLANS[plan][:renderings] || unlimited?
  # The offer builder, for professionals (Offer.usable_by? adds team maps).
  def offers? = PLANS[plan][:offers] || unlimited?

  # Drafts come from the trial only, not from the plan.
  def ai_trial? = !PLANS[plan][:ai_drafts] && @ai_trial_ends_at.present? && Time.current < @ai_trial_ends_at
  def ai_trial_ends_at = (@ai_trial_ends_at if ai_trial?)
  def paid? = plan != "free"

  def can_create_map?(user)
    unlimited? || user.billed_maps.count < max_maps
  end

  def as_json(*)
    { plan:, maxMaps: max_maps, pdfExport: pdf_export?, analyses: analyses?, aiDrafts: ai_drafts?, renderings: renderings?, offers: offers?, aiTrialEndsAt: ai_trial_ends_at&.iso8601 }
  end

  private
    # Everything is open while billing is not configured (local dev, beta).
    def unlimited?
      !Billing.enabled?
    end
end

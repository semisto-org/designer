# What a user's plan allows. Free: one active map with everything except the
# paid extras. Paid plans (Home for individuals, Pro and Team for
# professionals) unlock more active maps, more storage, scaled PDF, analyses,
# AI drafts and « Mettre en image ». Archived maps never count against the
# map limit (their files still count against storage). Editors invited on a
# map work with the payer's entitlements. A free user also gets AI drafts
# while their trial runs (AiTrial).
#
# The plan keys predate the names of October 2026 and stay as they are in
# the database and in Stripe metadata: "yearly" is Home, "atelier" is Pro,
# "bureau" is Team.
class Entitlements
  PLANS = {
    "free" => { max_maps: 1, storage_gb: 1, renderings_per_month: 0, pdf_export: false, analyses: false, ai_drafts: false, offers: false },
    "yearly" => { max_maps: 3, storage_gb: 5, renderings_per_month: 10, pdf_export: true, analyses: true, ai_drafts: true, offers: false },
    "atelier" => { max_maps: 6, storage_gb: 20, renderings_per_month: 30, pdf_export: true, analyses: true, ai_drafts: true, offers: true },
    "bureau" => { max_maps: 30, storage_gb: 120, renderings_per_month: 120, pdf_export: true, analyses: true, ai_drafts: true, offers: true }
  }.freeze

  # While billing is off (closed beta), « Mettre en image » keeps the former
  # monthly allowance.
  BETA_RENDERINGS_PER_MONTH = 30

  attr_reader :plan

  def self.for(user)
    new(user&.respond_to?(:current_plan_key) ? user.current_plan_key : "free", user)
  end

  # Entitlements that apply on a map: those of the user who pays for it, the
  # team's billing user or else its owner (Map#billing_user), except that the
  # own maps of someone who pays for a team follow the free plan
  # (Billing::Scope).
  def self.for_map(map)
    Billing::Scope.for_map(map).entitlements
  end

  def initialize(plan, user = nil)
    @plan = PLANS.key?(plan) ? plan : "free"
    @ai_trial_ends_at = user.ai_trial_ends_at if user.respond_to?(:ai_trial_ends_at)
  end

  # Active (not archived) maps the payer can have.
  def max_maps = PLANS[plan][:max_maps]
  # Bytes of photos, documents and other uploads across the payer's maps.
  # Unlimited while billing is off.
  def storage_bytes = unlimited? ? nil : PLANS[plan][:storage_gb] * 1.gigabyte
  def pdf_export? = PLANS[plan][:pdf_export] || unlimited?
  def analyses? = PLANS[plan][:analyses] || unlimited?
  def ai_drafts? = PLANS[plan][:ai_drafts] || unlimited? || ai_trial?
  # « Mettre en image » on photos (PhotoRendering), within a monthly quota.
  def renderings? = renderings_per_month.positive?
  def renderings_per_month = unlimited? ? BETA_RENDERINGS_PER_MONTH : PLANS[plan][:renderings_per_month]
  # The offer builder, for professionals (Offer.usable_by? adds team maps).
  def offers? = PLANS[plan][:offers] || unlimited?

  # Drafts come from the trial only, not from the plan.
  def ai_trial? = !PLANS[plan][:ai_drafts] && @ai_trial_ends_at.present? && Time.current < @ai_trial_ends_at
  def ai_trial_ends_at = (@ai_trial_ends_at if ai_trial?)
  def paid? = plan != "free"

  def as_json(*)
    {
      plan:, maxMaps: max_maps, storageBytes: storage_bytes, pdfExport: pdf_export?, analyses: analyses?, aiDrafts: ai_drafts?,
      renderings: renderings?, renderingsPerMonth: renderings_per_month, offers: offers?, aiTrialEndsAt: ai_trial_ends_at&.iso8601
    }
  end

  private
    # Everything is open while billing is not configured (local dev, beta).
    def unlimited?
      !Billing.enabled?
    end
end

# The offer builder is for whoever prices the work, never for the client:
# the members of a team map's team, or the owner of their own map with a
# professional plan (Offer.usable_by?). Loads @map (MapScoped) and @offer
# (the saved one, or a new one prefilled from the map).
module OfferScoped
  extend ActiveSupport::Concern
  include MapScoped

  included do
    before_action :set_map
    before_action :require_offer_shown!
    before_action :require_offer_access!, unless: -> { request.format.html? && action_name == "show" && controller_name == "offers" }
    before_action :set_offer
  end

  private
    def offer_access? = Offer.usable_by?(@map, Current.user)

    # A personal account has no offer builder to see, not even its upsell.
    def require_offer_shown!
      return if Offer.shown_to?(@map, Current.user)
      respond_to do |format|
        format.json { render json: { message: t("offers.errors.no_access") }, status: :forbidden }
        format.any { redirect_to map_path(@map) }
      end
    end

    def require_offer_access!
      return if offer_access?
      respond_to do |format|
        format.json { render json: { message: t("offers.errors.no_access") }, status: :forbidden }
        format.any { redirect_to map_offer_path(@map) }
      end
    end

    def set_offer
      @offer = @map.offer || Offer.build_for(@map) if offer_access?
    end

    def offer_json(offer = @offer)
      {
        inputs: offer.inputs, lockVersion: offer.lock_version, persisted: offer.persisted?,
        templateId: offer.offer_template_id, pricing: pricing_json(offer.pricing, offer.pricing_name),
        updatedAt: offer.updated_at&.iso8601, updatedBy: offer.updated_by&.display_name
      }
    end

    def measures_json(offer = @offer)
      offer.measures.to_h.merge("candidates" => offer.measures.candidates)
    end

    def versions_json(offer = @offer)
      offer.versions.includes(:created_by).map { version_json(_1) }
    end

    def version_json(version)
      {
        number: version.number, label: version.label, status: version.status, note: version.note,
        createdAt: version.created_at.iso8601, createdBy: version.created_by&.display_name, pricingName: version.pricing_name,
        totalTvac: version.result.dig("totals", "total_tvac"), totalMaxTvac: version.result.dig("totals", "total_max_tvac")
      }
    end

    # Who makes the offer, at the top of the document the client reads.
    def offer_issuer = @map.organization&.name || @map.owner.display_name

    # The page of the client document, for a version or the working offer.
    def client_document_props(document)
      {
        map: @map.as_inertia(Current.user).slice(:id, :name, :address, :areaM2),
        team: @map.organization && { name: @map.organization.name },
        issuer: offer_issuer, letterhead: @map.letterhead,
        # The « charte graphique » of the team, else of the owner (DocumentTheme).
        theme: DocumentTheme.for_map(@map).as_json,
        document: document.to_h.except(:letterDraft)
      }
    end

    def send_docx(document, label:, date:)
      export = Offer::DocxExport.new(document, label:, date:, theme: DocumentTheme.for_map(@map))
      send_data export.to_s, filename: export.filename, type: Mime[:docx], disposition: "attachment"
    end

    # What the page needs of a pricing to label and edit an offer.
    def pricing_json(pricing, name)
      {
        name:, settings: pricing.settings, categories: pricing.data["categories"],
        plantingTypes: pricing.data["planting_types"], complexity: pricing.complexity,
        targetDesignSharePct: pricing.target_design_share_pct, terms: pricing.terms,
        # The template's document blocks as they apply, before this offer's own changes.
        documentBlocks: Offer::Document.resolve(pricing.document)
      }
    end
end

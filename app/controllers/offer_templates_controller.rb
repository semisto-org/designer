# /offer_templates: the pricings (OfferTemplate) of the accounts I price
# offers for: my own, with a professional plan, and each of my teams'.
# Anyone of a team reads its templates; its admins change them. A new
# template is a copy of Semisto's pricing or of another template.
class OfferTemplatesController < ApplicationController
  before_action :set_template, only: %i[edit update destroy]
  before_action :require_writer!, only: %i[edit update destroy]

  def index
    render inertia: "offer_templates/index", props: {
      accounts: accounts.map { |account| account_json(account) }
    }
  end

  def create
    account = accounts.find { account_key(_1) == params[:account].to_s }
    return head(:not_found) unless account && writer?(account)
    from = OfferTemplate.where(owner: accounts).find_by(id: params[:from])
    template = OfferTemplate.copy_for(account, from:, name: from && t("offer_templates.copy_name", name: from.name))
    template.save!
    redirect_to edit_offer_template_path(template), status: :see_other
  end

  def edit
    render inertia: "offer_templates/edit", props: {
      template: template_json(@template).merge(data: @template.data),
      account: { key: account_key(@template.owner), name: account_name(@template.owner) },
      vocabulary: {
        phases: Offer::Pricing::PHASES, drivers: Offer::Pricing::DRIVERS, conditions: Offer::Pricing::CONDITIONS,
        clientTypes: Offer::Pricing::CLIENT_TYPES, supplies: Offer::Pricing::SUPPLY_KEYS,
        settings: Offer::Pricing::SETTINGS.transform_values { |(_, min, max)| { min:, max: } }
      }
    }
  end

  def update
    attributes = params.require(:template).permit(:name, client_types: []).to_h
    attributes[:data] = params[:template][:data].to_unsafe_h if params.dig(:template, :data).respond_to?(:to_unsafe_h)
    if @template.update(attributes)
      render json: { template: template_json(@template).merge(data: @template.data) }
    else
      render_errors @template
    end
  end

  def destroy
    @template.destroy!
    redirect_to offer_templates_path, notice: t("offer_templates.deleted", name: @template.name), status: :see_other
  end

  private
    # The accounts I price for: me with a professional plan, then my teams.
    def accounts
      @accounts ||= [ (Current.user if Current.user.professional? && Entitlements.for(Current.user).offers?), *Current.user.organizations.order(:name) ].compact
    end

    def writer?(account) = account == Current.user || (account.is_a?(Organization) && account.admin?(Current.user))

    def set_template
      @template = OfferTemplate.where(owner: accounts).find(params[:id])
    end

    def require_writer!
      return if writer?(@template.owner)
      respond_to do |format|
        format.json { render json: { message: t("offer_templates.admins_only") }, status: :forbidden }
        format.any { redirect_to offer_templates_path, alert: t("offer_templates.admins_only"), status: :see_other }
      end
    end

    def account_key(account) = account.is_a?(Organization) ? "team-#{account.id}" : "me"
    def account_name(account) = account.is_a?(Organization) ? account.name : nil

    def account_json(account)
      {
        key: account_key(account), name: account_name(account), canEdit: writer?(account),
        templates: OfferTemplate.where(owner: account).ordered.map { template_json(_1) }
      }
    end

    def template_json(template)
      { id: template.id, name: template.name, clientTypes: template.client_types, updatedAt: template.updated_at&.iso8601 }
    end
end

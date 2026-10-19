# /request_forms (« Demandes »): the public request form of each account I
# work for (mine with a professional plan, each of my teams'), with the
# requests it brought in. Anyone of a team reads them; switching the form on
# or off and its text are for the team's admins.
class RequestFormsController < ApplicationController
  before_action :set_form, only: :update
  before_action -> { require_writer!(@form.owner) }, only: :update

  def index
    render inertia: "request_forms/index", props: {
      accounts: accounts.map { |account| account_json(account) }
    }
  end

  def create
    account = accounts.find { account_key(_1) == params[:account].to_s }
    return head(:not_found) unless account
    return require_writer!(account) unless writer?(account)
    form = RequestForm.find_or_create_by!(owner: account)
    form.update!(active: true)
    redirect_to request_forms_path, notice: t("request_forms.opened"), status: :see_other
  end

  def update
    if @form.update(params.require(:form).permit(:active, :intro))
      render json: { form: form_json(@form) }
    else
      render_errors @form
    end
  end

  private
    def accounts
      @accounts ||= [ (Current.user if Current.user.professional? && Entitlements.for(Current.user).offers?), *Current.user.organizations.order(:name) ].compact
    end

    def writer?(account) = account == Current.user || (account.is_a?(Organization) && account.admin?(Current.user))

    def set_form
      @form = RequestForm.where(owner: accounts).find(params[:id])
    end

    def require_writer!(account)
      return if writer?(account)
      respond_to do |format|
        format.json { render json: { message: t("request_forms.admins_only") }, status: :forbidden }
        format.any { redirect_to request_forms_path, alert: t("request_forms.admins_only"), status: :see_other }
      end
    end

    def account_key(account) = account.is_a?(Organization) ? "team-#{account.id}" : "me"

    def account_json(account)
      form = RequestForm.find_by(owner: account)
      {
        key: account_key(account), name: account.is_a?(Organization) ? account.name : nil, canEdit: writer?(account),
        form: form && form_json(form),
        requests: form ? form.project_requests.newest_first.limit(200).map { request_json(_1) } : []
      }
    end

    def form_json(form)
      { id: form.id, slug: form.slug, active: form.active, intro: form.intro, url: public_request_form_url(form.slug), displayName: form.display_name }
    end

    def request_json(request)
      {
        id: request.id, formId: request.request_form_id, name: request.name, address: request.address,
        status: request.status, createdAt: request.created_at.iso8601, areaM2: request.area_m2,
        parcels: request.parcels.size, mapId: request.map_id, profile: request.answers["profile"]
      }
    end
end

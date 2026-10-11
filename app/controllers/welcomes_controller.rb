# /welcome — asked once, after the first sign-in: does the person design
# their own place or for clients? « Mes cartes » sends here until they have
# answered; the answer can be changed later in « Mon compte ».
class WelcomesController < ApplicationController
  forbid_while_impersonating only: :update

  def show
    render inertia: "welcomes/show", props: {
      name: Current.user.name&.split&.first,
      accountKind: Current.user.account_kind,
      prices: Billing::Catalog.as_json.to_h { |plan| [ plan[:key], plan[:priceCents] ] }
    }
  end

  def update
    if Current.user.update(account_kind: params.require(:account_kind).to_s)
      redirect_to maps_path
    else
      redirect_to welcome_path, alert: t("welcome.invalid")
    end
  end
end

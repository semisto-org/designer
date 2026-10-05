# Personal access tokens: created as JSON so the token is only ever in the
# response that shows it once, revoked with a regular Inertia visit.
module Account
  class ApiTokensController < ApplicationController
    forbid_while_impersonating only: :create

    def create
      token = ApiToken.new(user: Current.user)
      token.assign_attributes(params.require(:api_token).permit(:name, :access, :expires_in))
      if token.save
        render json: { token: token.as_inertia, plaintext: token.plaintext }, status: :created
      else
        render_errors token
      end
    end

    def destroy
      ApiToken.where(user: Current.user).find(params[:id]).revoke!
      redirect_to account_ai_path, notice: t("account_ai.tokens.revoked"), status: :see_other
    end
  end
end

# Revokes every token an OAuth client holds for the signed-in user: the
# connector stops working until the user authorizes it again.
module Account
  class OauthAppsController < ApplicationController
    def destroy
      client = OauthClient.find(params[:id])
      OauthAccessToken.revoke_all!(user: Current.user, client:)
      redirect_to account_ai_path, notice: t("account_ai.apps.revoked", name: client.name), status: :see_other
    end
  end
end

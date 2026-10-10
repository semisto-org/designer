# The version of the deployed frontend, the same one Inertia sends with every
# page. A page left open (a tab in the background, the app on an iPad home
# screen, which has no reload button) polls it to offer « Recharger » once a
# new version is deployed.
class AppVersionsController < ApplicationController
  allow_unauthenticated_access

  def show
    response.headers["Cache-Control"] = "no-store"
    render json: { version: InertiaRails.configuration.version.to_s }
  end
end

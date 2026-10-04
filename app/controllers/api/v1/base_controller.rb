# JSON endpoints written for Semisto's phone app (MobileApp), next to the
# editor's JSON endpoints it also calls with the same token. Signed out:
# 401, never a redirect to the sign-in page.
module Api
  module V1
    class BaseController < ApplicationController
      before_action { request.format = :json }

      private
        def request_authentication
          head :unauthorized
        end
    end
  end
end

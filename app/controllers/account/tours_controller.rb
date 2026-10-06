# The editor's « carnet de route »: remembers that the person has seen it, so
# it opens by itself only once (it stays one click away in « Parcours »).
module Account
  class ToursController < ApplicationController
    def update
      # An admin signed in as someone else must not use up their first visit.
      Current.user.update!(tour_seen_at: Time.current) unless impersonating? || Current.user.tour_seen_at
      head :no_content
    end
  end
end

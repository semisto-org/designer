# Super admin « Cartes »: every map of every account with its figures, sorted
# and filtered in the browser (there are a few hundred maps at most).
module Admin
  class MapsController < BaseController
    def index
      render inertia: "admin/maps/index", props: { maps: Admin::MapStats.call }
    end
  end
end

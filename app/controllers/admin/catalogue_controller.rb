# Super admin « Catalogue »: how complete the plant sheets are for the fields
# that decide suggestions, and the most used sheets to complete first.
module Admin
  class CatalogueController < BaseController
    def show
      render inertia: "admin/catalogue/show", props: { coverage: CatalogueCoverage.new }
    end
  end
end

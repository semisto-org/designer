# JSON for the « Règles et risques » panel of the map editor: natural and
# technological risks at the map's place and the town-planning rules of its
# outline, when the map's region has providers for them.
module Maps
  class SiteRulesController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: SiteRules::MapReport.new(@map).as_json
    end
  end
end

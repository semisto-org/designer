# What each element of a map does, needs and gives, and which functions only
# one element serves, for the « Fonctions » panel and the inspector.
module Maps
  class FunctionsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      render json: ElementFunctions.new(@map).as_json
    end
  end
end

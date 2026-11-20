# JSON for the existing trees' sheet in the editor: how tall the relief's
# surface model sees each tree (Relief::TreeHeights). The person then keeps
# the height or not; nothing is written here.
module Maps
  class TreeHeightsController < ApplicationController
    include MapScoped

    before_action :set_map

    def show
      heights = Relief::TreeHeights.new(@map)
      trees = @map.features.active.in_design.where(kind: "existing_tree")
      ids = params[:ids].to_s.split(",").map(&:to_i).select(&:positive?)
      trees = trees.where(id: ids) if ids.any?
      render json: {
        available: heights.available?,
        source: heights.source,
        heights: heights.for_features(trees.limit(500).to_a).transform_keys(&:to_s)
      }
    end
  end
end

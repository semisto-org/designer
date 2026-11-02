module Mcp
  module Tools
    # The offer of a map, for whoever may price it (Offer.usable_by?: the
    # map's team, or its owner with a professional plan), never for the
    # client: the saved offer, or a new one prefilled from the map.
    module OfferAccess
      module_function

      def offer!(tool, map)
        raise ToolError, I18n.t("mcp.errors.offer_not_allowed") unless Offer.usable_by?(map, tool.send(:user))
        map.offer || Offer.build_for(map)
      end
    end
  end
end

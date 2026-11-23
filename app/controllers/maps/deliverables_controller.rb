module Maps
  # « Livrable client » (Pro and Team plans): the client's whole project file
  # at a private link, the plan as a snapshot (published, refreshed,
  # unpublished, given a new address like the public view) and the
  # documents, photos, videos and soil analyses the team marks for it, read
  # live. The map's editors publish it: on a design office's map, the team.
  # Once published, it stays readable when the plan ends; only publishing
  # again needs the plan (nothing is taken hostage).
  class DeliverablesController < PublicationsController
    before_action :require_plan!, only: %i[create update]

    private
      def kind = "deliverable"
      def require_publisher! = require_editor!
      def publication_of(map) = map.deliverable
      def publication_url(publication) = deliverable_url(publication.token)

      def require_plan!
        return if Entitlements.for_map(@map).deliverables?
        render json: { message: t("deliverables.errors.plan"), code: "plan" }, status: :payment_required
      end

      def payload(map = @map)
        super.merge(
          entitled: Entitlements.for_map(map).deliverables?,
          contents: Deliverable::Contents.new(map).counts
        )
      end
  end
end

# Semisto staff: « Vues drone ». The paid drone orders (newest first), each
# with the buyer's maps and the views already delivered; staff add the
# dated aerial view to one of the buyer's maps (the owner is e-mailed), or
# to any map by its number (Semisto's own maps, no e-mail), and remove a
# view. Admins only (anyone else gets a 404, as if the page did not exist).
module Admin
  class AerialViewsController < ApplicationController
    before_action :require_admin!

    FILTERS = %w[todo done all].freeze
    LIST_LIMIT = 200

    def index
      filter = FILTERS.include?(params[:status]) ? params[:status] : "todo"
      orders = PlanPurchase.drone.paid.newest_first
        .includes(:billing_payments, user: :owned_maps, aerial_views: [ :created_by, { map: :owner } ])
      orders = case filter
      when "todo" then orders.where.not(id: delivered_order_ids)
      when "done" then orders.where(id: delivered_order_ids)
      else orders
      end
      render inertia: "admin/aerial_views/index", props: {
        orders: orders.limit(LIST_LIMIT).map { |order| order_json(order) },
        otherViews: AerialView.where(plan_purchase_id: nil).newest_first.includes(:created_by, map: :owner).limit(LIST_LIMIT).map(&:as_admin_json),
        counts: counts,
        filters: { status: filter }
      }
    end

    def create
      view = AerialView.new(view_params)
      view.map = Map.active.find_by(id: params.dig(:aerial_view, :map_id))
      order_id = params.dig(:aerial_view, :plan_purchase_id).presence
      view.plan_purchase = PlanPurchase.drone.paid.find(order_id) if order_id
      view.created_by = Current.user
      if view.save
        key = view.plan_purchase ? "drone.admin.flash.added_and_notified" : "drone.admin.flash.added"
        redirect_back_or_to admin_aerial_views_path, notice: t(key, map: view.map.name, name: view.map.owner.display_name), status: :see_other
      else
        redirect_back_or_to admin_aerial_views_path, inertia: { errors: view.errors }, status: :see_other
      end
    end

    def destroy
      view = AerialView.find(params[:id])
      view.destroy!
      redirect_back_or_to admin_aerial_views_path, notice: t("drone.admin.flash.removed", map: view.map.name), status: :see_other
    end

    private
      def require_admin!
        head :not_found unless Current.user&.admin?
      end

      def view_params
        params.require(:aerial_view).permit(:name, :captured_on, :kind, :url, :attribution, :min_zoom, :max_zoom)
      end

      def delivered_order_ids = AerialView.where.not(plan_purchase_id: nil).select(:plan_purchase_id)

      def counts
        all = PlanPurchase.drone.paid
        done = all.where(id: delivered_order_ids).count
        { todo: all.count - done, done:, all: all.count }
      end

      def order_json(order)
        payment = order.billing_payments.min_by(&:paid_at)
        {
          id: order.id, paidAt: order.starts_at.iso8601,
          amountCents: payment&.amount_cents, currency: payment&.currency,
          user: { id: order.user.id, name: order.user.display_name, email: order.user.email_address },
          maps: order.user.owned_maps.select { |map| map.archived_at.nil? }.sort_by(&:created_at).map do |map|
            { id: map.id, name: map.name, areaM2: map.area_m2&.to_f, address: map.address }
          end,
          views: order.aerial_views.sort_by { |view| [ view.captured_on, view.id ] }.reverse.map(&:as_admin_json)
        }
      end
  end
end

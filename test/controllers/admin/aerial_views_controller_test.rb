require "test_helper"
require_relative "../../test_helpers/drone_test_helper"

class Admin::AerialViewsControllerTest < ActionDispatch::IntegrationTest
  include DroneTestHelper
  include ActionMailer::TestHelper

  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
    @map = maps(:ahinvaux)
    @buyer = users(:michael)
    @order = drone_order(@buyer, paid_at: 2.days.ago)
    @other_order = drone_order(users(:bob), paid_at: 1.day.ago)
  end

  def props = response.parsed_body["props"]

  def view_params(**overrides)
    { aerial_view: { map_id: @map.id, plan_purchase_id: @order.id, captured_on: "2027-05-12", kind: "pmtiles", url: PMTILES_URL }.merge(overrides) }
  end

  test "requires sign in" do
    get admin_aerial_views_path
    assert_redirected_to new_session_path
  end

  test "regular users get a 404 on the list and on every action, like the other staff screens" do
    view = aerial_view(@map)
    sign_in_as users(:alice)
    get admin_aerial_views_path
    assert_response :not_found
    assert_no_difference("AerialView.count") { post admin_aerial_views_path, params: view_params }
    assert_response :not_found
    assert_no_difference("AerialView.count") { delete admin_aerial_view_path(view) }
    assert_response :not_found

    sign_in_as @buyer
    get admin_aerial_views_path
    assert_response :not_found
  end

  test "staff see the paid drone orders to configure, newest first, with the buyer and their maps" do
    archived = @buyer.owned_maps.create!(name: "Ancienne carte", region: regions(:wallonia), archived_at: 1.day.ago)
    drone_order(users(:alice), status: "refunded")
    @buyer.plan_purchases.create!(plan_key: "yearly", starts_at: Time.current, expires_at: 1.year.from_now, stripe_checkout_session_id: "cs_yearly")
    @buyer.billing_payments.create!(plan_purchase: @order, plan_key: "drone", amount_cents: 28_000, paid_at: 2.days.ago)

    sign_in_as @admin
    get admin_aerial_views_path, headers: inertia_headers
    assert_response :success
    assert_equal "admin/aerial_views/index", response.parsed_body["component"]
    assert_equal [ @other_order.id, @order.id ], props["orders"].map { _1["id"] }
    assert_equal({ "todo" => 2, "done" => 0, "all" => 2 }, props["counts"])
    assert_equal({ "status" => "todo" }, props["filters"])
    row = props["orders"].last
    assert_equal [ "Michael", "michael@example.org" ], row["user"].values_at("name", "email")
    assert_equal 28_000, row["amountCents"]
    assert_equal [ @map.id ], row["maps"].map { _1["id"] }
    assert_not_includes row["maps"].map { _1["id"] }, archived.id
    assert_equal [], row["views"]
    assert_equal [], props["otherViews"]
  end

  test "an order with a view moves to « Configurées »; views without an order are listed apart" do
    delivered = aerial_view(@map, plan_purchase: @order)
    own = aerial_view(@map, captured_on: Date.new(2026, 9, 3))
    sign_in_as @admin

    get admin_aerial_views_path, headers: inertia_headers
    assert_equal [ @other_order.id ], props["orders"].map { _1["id"] }
    assert_equal({ "todo" => 1, "done" => 1, "all" => 2 }, props["counts"])
    assert_equal [ own.id ], props["otherViews"].map { _1["id"] }

    get admin_aerial_views_path(status: "done"), headers: inertia_headers
    assert_equal [ @order.id ], props["orders"].map { _1["id"] }
    assert_equal [ delivered.id ], props["orders"].sole["views"].map { _1["id"] }
    assert_equal "drone.example.org", props["orders"].sole["views"].sole["host"]

    get admin_aerial_views_path(status: "all"), headers: inertia_headers
    assert_equal 2, props["orders"].size
  end

  test "staff add the view of an order to the buyer's map, and the buyer is e-mailed" do
    sign_in_as @admin
    assert_difference("AerialView.count", 1) do
      assert_enqueued_email_with DroneMailer, :view_ready, args: ->(args) { args.first.is_a?(AerialView) } do
        post admin_aerial_views_path, params: view_params(name: "Vue drone de printemps", attribution: "© Semisto", max_zoom: "22")
      end
    end
    assert_redirected_to admin_aerial_views_path
    view = AerialView.last
    assert_equal [ @map, @order, @admin, "Vue drone de printemps", Date.new(2027, 5, 12), 22, nil ],
      [ view.map, view.plan_purchase, view.created_by, view.name, view.captured_on, view.max_zoom, view.min_zoom ]
    assert_equal "Vue ajoutée sur la carte « Domaine d'Ahinvaux » ; un e-mail prévient Michael.", flash[:notice]
  end

  test "a view goes on any map by its number, without an e-mail" do
    sign_in_as @admin
    assert_difference("AerialView.count", 1) do
      assert_no_enqueued_emails do
        post admin_aerial_views_path, params: view_params(plan_purchase_id: "", kind: "xyz", url: XYZ_URL)
      end
    end
    view = AerialView.last
    assert_nil view.plan_purchase
    assert_equal "xyz", view.kind
    assert_equal "Vue ajoutée sur la carte « Domaine d'Ahinvaux ».", flash[:notice]
  end

  test "errors come back to the form, field by field, in French" do
    sign_in_as @admin
    assert_no_difference("AerialView.count") do
      post admin_aerial_views_path, params: view_params(captured_on: "", url: "http://tiles.example.org/a.pmtiles"),
        headers: { "HTTP_REFERER" => admin_aerial_views_url }
    end
    assert_redirected_to admin_aerial_views_url
    follow_redirect!(headers: inertia_headers)
    errors = props["errors"]
    assert_equal [ "Indiquez la date de la prise de vue." ], Array(errors["captured_on"])
    assert_match "https://", Array(errors["url"]).first
  end

  test "an order's view cannot go on someone else's map, nor on an unknown or archived map" do
    sign_in_as @admin
    assert_no_difference("AerialView.count") do
      post admin_aerial_views_path, params: view_params(plan_purchase_id: @other_order.id)
      post admin_aerial_views_path, params: view_params(plan_purchase_id: "", map_id: 0)
      @map.update!(archived_at: Time.current)
      post admin_aerial_views_path, params: view_params(plan_purchase_id: "")
    end
    get admin_aerial_views_path, headers: inertia_headers
    assert_equal [ "Aucune carte active ne porte ce numéro." ], Array(props.dig("errors", "map"))
  end

  test "an order that is not a paid drone mission is refused" do
    refunded = drone_order(@buyer, status: "refunded")
    sign_in_as @admin
    assert_no_difference("AerialView.count") { post admin_aerial_views_path, params: view_params(plan_purchase_id: refunded.id) }
    assert_response :not_found
  end

  test "staff remove a view" do
    view = aerial_view(@map, plan_purchase: @order)
    sign_in_as @admin
    assert_difference("AerialView.count", -1) { delete admin_aerial_view_path(view) }
    assert_redirected_to admin_aerial_views_path
    assert_equal "Vue retirée de la carte « Domaine d'Ahinvaux ».", flash[:notice]
    assert @order.reload.persisted?
  end
end

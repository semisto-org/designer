require "test_helper"
require_relative "../test_helpers/drone_test_helper"

class AerialViewTest < ActiveSupport::TestCase
  include DroneTestHelper
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
  end

  def build(**attributes)
    @map.aerial_views.new({ captured_on: Date.new(2027, 5, 12), kind: "pmtiles", url: PMTILES_URL }.merge(attributes))
  end

  def url_error(**attributes)
    view = build(**attributes)
    assert_not view.valid?
    view.errors.details[:url].map { _1[:error] }
  end

  test "a PMTiles archive or an XYZ template over https is valid, named « Vue drone » by default" do
    assert build.valid?
    assert build(url: "https://drone.example.org/t.pmtiles?v=2").valid?
    assert build(kind: "xyz", url: XYZ_URL).valid?
    assert_equal "Vue drone", build.tap(&:valid?).name
    assert_equal "Vue drone", build(name: "   ").tap(&:valid?).name
    assert_equal "Vue drone d'été", build(name: " Vue drone  d'été ").tap(&:valid?).name
  end

  test "the capture date is required" do
    view = build(captured_on: nil)
    assert_not view.valid?
    assert_equal [ "Indiquez la date de la prise de vue." ], view.errors[:captured_on]
  end

  test "only https, with a host and no credentials" do
    assert_equal [ :not_https ], url_error(url: "http://drone.example.org/t.pmtiles")
    assert_equal [ :not_https ], url_error(url: "https:///t.pmtiles")
    assert_equal [ :not_https ], url_error(url: "https://user:secret@drone.example.org/t.pmtiles")
    assert_equal [ :not_https ], url_error(kind: "xyz", url: "javascript:alert(1)//{z}/{x}/{y}")
    assert_equal [ :not_https ], url_error(url: "ftp://drone.example.org/t.pmtiles")
    assert_equal [ :malformed ], url_error(url: "https://drone.example.org/mon terrain.pmtiles")
    assert_equal [ :blank ], url_error(url: "  ")
  end

  test "each kind has its own shape of address" do
    assert_equal [ :xyz_template ], url_error(kind: "xyz", url: "https://tiles.example.org/{z}/{y}.png")
    assert_equal [ :pmtiles_file ], url_error(url: "https://drone.example.org/t.mbtiles")
    assert_equal [ :pmtiles_file ], url_error(url: "https://drone.example.org/{z}/{x}/{y}.pmtiles")
    view = build(kind: "wms")
    assert_not view.valid?
    assert_equal [ "Choisissez le format : archive PMTiles ou tuiles XYZ." ], view.errors[:kind]
  end

  test "zoom levels are optional whole numbers from 0 to 24, in order" do
    assert build(min_zoom: 14, max_zoom: 22).valid?
    assert_not build(max_zoom: 25).valid?
    assert_not build(min_zoom: -1).valid?
    assert_not build(min_zoom: 1.5).valid?
    view = build(min_zoom: 20, max_zoom: 18)
    assert_not view.valid?
    assert_equal [ "Le zoom maximum doit être au moins égal au zoom minimum." ], view.errors[:max_zoom]
  end

  test "a view delivering an order goes on one of the buyer's maps, and the order is a drone mission" do
    assert build(plan_purchase: drone_order(users(:michael))).valid?

    view = build(plan_purchase: drone_order(users(:bob)))
    assert_not view.valid?
    assert_equal [ "Cette carte n'appartient pas à la personne qui a commandé la mission." ], view.errors[:map]

    yearly = users(:michael).plan_purchases.create!(plan_key: "yearly", starts_at: Time.current, expires_at: 1.year.from_now,
                                                     stripe_checkout_session_id: "cs_yearly_1")
    view = build(plan_purchase: yearly)
    assert_not view.valid?
    assert_equal [ "Cette commande n'est pas une mission drone." ], view.errors[:plan_purchase]
  end

  test "the owner is e-mailed when a view delivers an order, not otherwise" do
    order = drone_order(users(:michael))
    assert_enqueued_email_with DroneMailer, :view_ready, args: ->(args) { args.first.is_a?(AerialView) } do
      aerial_view(@map, plan_purchase: order)
    end
    assert_no_enqueued_emails { aerial_view(@map) }
  end

  test "a map lists its views newest first, and they go with it" do
    older = aerial_view(@map, captured_on: Date.new(2026, 9, 3))
    newer = aerial_view(@map, captured_on: Date.new(2027, 5, 12), kind: "xyz", url: XYZ_URL)
    assert_equal [ newer, older ], @map.reload.aerial_views.to_a
    assert_difference("AerialView.count", -2) { @map.destroy! }
  end

  test "removing an order keeps the view on the map" do
    order = drone_order(users(:michael))
    view = aerial_view(@map, plan_purchase: order)
    order.destroy!
    assert_nil view.reload.plan_purchase_id
  end

  test "what the editor receives and the host staff see" do
    view = aerial_view(@map, kind: "xyz", url: XYZ_URL, attribution: "© Semisto 2027", max_zoom: 22)
    assert_equal({ "id" => view.id, "name" => "Vue drone", "capturedOn" => "2027-05-12", "kind" => "xyz", "url" => XYZ_URL,
                   "attribution" => "© Semisto 2027", "minZoom" => nil, "maxZoom" => 22 }, view.as_inertia.stringify_keys)
    assert_equal "tiles.example.org", view.host
    assert_equal [ @map.id, @map.name, "Michael" ], view.as_admin_json.values_at(:mapId, :mapName, :ownerName)
  end
end

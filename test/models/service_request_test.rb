require "test_helper"

class ServiceRequestTest < ActiveSupport::TestCase
  include ActionMailer::TestHelper

  setup do
    @map = maps(:ahinvaux)
    @user = users(:michael)
  end

  def build(kind: "order_plants", payload: { "plants_free_text" => "Des noisetiers" }, consent: true, **attrs)
    @map.service_requests.new(user: @user, kind:, payload:, contact_consent: consent, **attrs)
  end

  test "an order needs plants or a description" do
    assert build.valid?
    assert build(payload: { "plants" => [ { "name" => "Noyer commun", "quantity" => 3 } ] }).valid?
    request = build(payload: { "message" => "Bonjour" })
    assert_not request.valid?
    assert_includes request.errors.full_messages, I18n.t("activerecord.errors.models.service_request.attributes.base.plants_missing")
  end

  test "an implementation needs a place" do
    assert_not build(kind: "implementation", payload: { "surface_m2" => 1200 }).valid?
    assert build(kind: "implementation", payload: { "surface_m2" => 1200, "commune" => "Yvoir" }).valid?
    assert build(kind: "implementation", payload: { "address" => "Rue des Bois 3, 5530 Yvoir" }).valid?
  end

  test "co-management needs a scope or a message" do
    assert_not build(kind: "co_management", payload: { "frequency" => "monthly" }).valid?
    assert build(kind: "co_management", payload: { "scope" => %w[pruning harvest] }).valid?
    assert build(kind: "co_management", payload: { "message" => "On en parle ?" }).valid?
  end

  test "explicit consent is required to create a request" do
    request = build(consent: false)
    assert_not request.valid?
    assert_includes request.errors.full_messages, I18n.t("activerecord.errors.models.service_request.attributes.base.consent_missing")
  end

  test "kind and status are closed lists" do
    assert_not build(kind: "spam").valid?
    request = build.tap(&:save!)
    request.status = "weird"
    assert_not request.valid?
  end

  test "the payload is cleaned against the schema of its kind: foreign keys and blank rows are dropped" do
    request = build(payload: {
      "plants" => [ { "name" => "Noyer", "quantity" => "3", "species_id" => 12, "evil" => "x" }, { "name" => "", "quantity" => 2 } ],
      "phone" => " 0470 00 00 00 ", "surface_m2" => 400, "unknown" => "dropped"
    })
    assert request.valid?
    assert_equal [ { "name" => "Noyer", "quantity" => 3, "species_id" => 12 } ], request.payload["plants"]
    assert_equal "0470 00 00 00", request.payload["phone"]
    assert_not request.payload.key?("unknown")
    assert_not request.payload.key?("surface_m2"), "surface_m2 belongs to implementation"
  end

  test "invalid payload values are reported, nothing invalid is stored" do
    request = build(payload: { "plants_free_text" => "x", "delivery" => "drone", "plants" => [ { "name" => "A", "quantity" => 0 } ] })
    assert_not request.valid?
    assert request.errors.full_messages.any? { _1.include?("delivery") }
    assert request.errors.full_messages.any? { _1.include?("payload.plants.0.quantity") }
  end

  test "creating captures a snapshot of the map and stamps the consent" do
    @map.features.create!(layer: "plants", kind: "tree", name: "Noyer", geometry: point)
    request = build.tap(&:save!)
    assert_equal "Domaine d'Ahinvaux", request.snapshot["map_name"]
    assert_equal 1, request.snapshot["plants_count"]
    assert_equal "design", request.snapshot["stage"]
    assert_equal "Michael", request.snapshot["owner_name"]
    assert request.consented_at.present?
    assert_equal "new", request.status
  end

  test "status changes stamp contacted and closed dates" do
    request = build.tap(&:save!)
    request.update!(status: "contacted", handled_by: users(:alice))
    assert request.contacted_at.present?
    assert_nil request.closed_at
    request.update!(status: "closed")
    assert request.closed_at.present?
    request.update!(status: "new")
    assert_nil request.closed_at
  end

  test "creating enqueues one mail to Semisto and one confirmation to the person" do
    assert_enqueued_emails 2 do
      build.save!
    end
  end

  test "an invalid request sends nothing" do
    assert_no_enqueued_emails { build(consent: false).save }
  end

  test "recipients come from SEMISTO_REQUESTS_EMAIL, defaulting to designer@semisto.org" do
    original = ENV["SEMISTO_REQUESTS_EMAIL"]
    ENV.delete("SEMISTO_REQUESTS_EMAIL")
    assert_equal [ "designer@semisto.org" ], ServiceRequest.recipients
    ENV["SEMISTO_REQUESTS_EMAIL"] = "plants@semisto.org, chantiers@semisto.org"
    assert_equal %w[plants@semisto.org chantiers@semisto.org], ServiceRequest.recipients
    ENV["SEMISTO_REQUESTS_EMAIL"] = " "
    assert_equal [ "designer@semisto.org" ], ServiceRequest.recipients
  ensure
    original ? ENV["SEMISTO_REQUESTS_EMAIL"] = original : ENV.delete("SEMISTO_REQUESTS_EMAIL")
  end

  test "pending scope is new and contacted" do
    a = build.tap(&:save!)
    b = build.tap(&:save!).tap { _1.update!(status: "contacted") }
    c = build.tap(&:save!).tap { _1.update!(status: "closed") }
    assert_equal [ a, b ].map(&:id).sort, ServiceRequest.pending.pluck(:id).sort
    assert_not_includes ServiceRequest.pending, c
  end

  test "summary lines are readable French, with labels from the locale" do
    request = build(payload: { "plants" => [ { "name" => "Noyer", "quantity" => 3, "note" => "greffé" } ], "delivery" => "pickup", "message" => "Merci" }).tap(&:save!)
    lines = ServiceRequest::Summary.new(request).lines.to_h { [ _1[:label], _1[:value] ] }
    assert_equal "Noyer × 3 (greffé)", lines["Plants souhaités"]
    assert_equal "Je viens chercher", lines["Retrait ou livraison"]
    assert_equal "Merci", lines["Message pour la pépinière"]
  end

  test "every payload field and option has a French label" do
    ServiceRequest::PAYLOADS.each do |kind, fields|
      assert I18n.exists?("journey.requests.kinds.#{kind}.title"), kind
      fields.each do |field|
        base = "journey.requests.kinds.#{kind}.fields.#{field.key}"
        assert I18n.exists?("#{base}.label"), "label #{kind}.#{field.key}"
        field.values&.each { |v| assert I18n.exists?("#{base}.options.#{v}"), "option #{v} of #{kind}.#{field.key}" }
        field.item&.reject(&:hidden)&.each { |item| assert I18n.exists?("#{base}.item.#{item.key}.label"), "item #{kind}.#{field.key}.#{item.key}" }
      end
    end
  end
end

class ServiceRequestPrefillTest < ActiveSupport::TestCase
  setup { @map = Map.create!(name: "Test", owner: users(:bob), region: regions(:wallonia), address: "Rue des Bois 3, 5530 Yvoir") }

  test "without a plant list, plants come from the named plants placed on the map" do
    @map.features.create!(layer: "plants", kind: "tree", name: "Noyer", geometry: point)
    @map.features.create!(layer: "plants", kind: "tree", name: "Noyer", geometry: point(lng: 4.91))
    @map.features.create!(layer: "plants", kind: "shrub", name: "Cassis", geometry: point(lng: 4.92))
    @map.features.create!(layer: "plants", kind: "tree", geometry: point(lng: 4.93))
    @map.features.create!(layer: "plants", kind: "tree", name: "Rejeté", status: "rejected", geometry: point(lng: 4.94))
    prefill = ServiceRequest::Prefill.new(@map)
    assert_equal "features", prefill.source
    assert_equal [ { "name" => "Cassis", "quantity" => 1 }, { "name" => "Noyer", "quantity" => 2 }, { "name" => "Plante à préciser", "quantity" => 1 } ], prefill.plants
  end

  test "no plants, no source" do
    prefill = ServiceRequest::Prefill.new(@map)
    assert_equal [], prefill.plants
    assert_nil prefill.source
  end

  test "uses the map's plant list when it has one" do
    2.times { |i| @map.features.create!(layer: "plants", kind: "plant", geometry: point(lng: 4.906 + i * 0.0001, lat: 50.341), properties: { "species_id" => plant_species(:apple).id }) }
    prefill = ServiceRequest::Prefill.new(@map)
    assert_equal "plant_list", prefill.source
    line = prefill.plants.sole
    assert_equal 2, line["quantity"]
    assert_equal plant_species(:apple).id, line["species_id"]
    assert_includes line["name"], "Malus domestica"
  end

  test "a broken or empty plant list falls back to the plan instead of failing" do
    @map.features.create!(layer: "plants", kind: "tree", name: "Noyer", geometry: point)
    @map.define_singleton_method(:plant_list) { raise "boom" }
    prefill = ServiceRequest::Prefill.new(@map)
    assert_equal "features", prefill.source
    assert_equal "features", ServiceRequest::Prefill.new(Map.find(@map.id)).source
  end

  test "surface, address and commune" do
    @map.update_columns(area_m2: 1234.6)
    json = ServiceRequest::Prefill.new(@map).as_json
    assert_equal 1235, json[:surfaceM2]
    assert_equal "Rue des Bois 3, 5530 Yvoir", json[:address]
    assert_equal "Yvoir", json[:commune]
    assert_nil ServiceRequest::Prefill.new(Map.new(address: "Chez moi")).commune
  end
end

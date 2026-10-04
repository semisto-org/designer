require "test_helper"

class Imports::Claudy::NetworkResolverTest < ActiveSupport::TestCase
  Resolver = Imports::Claudy::NetworkResolver

  def node(layer_id, properties) = { "layer_id" => layer_id, "layer_kind" => "network", "properties" => properties }

  test "recognises a network from its distinctive nodes" do
    features = [
      node(5, {}), node(5, { "node_type" => "cistern" }), node(5, { "node_type" => "valve" }),
      node(6, { "node_type" => "outlet" }), node(7, { "node_type" => "switch" }),
      node(8, { "water_source" => "well" }), node(9, { "equipment" => "unifi" }), node(10, { "node_type" => "meter" })
    ]
    assert_equal({ "5" => "water", "6" => "electricity", "7" => "ethernet", "8" => "water", "9" => "ethernet", "10" => nil },
                 Resolver.resolve(layers: [], features:))
  end

  test "a layer's declared network wins over guesses, an override over both" do
    layers = [ { "id" => 5, "kind" => "network", "settings" => { "network" => "electric" } }, { "id" => 2, "kind" => "management" } ]
    features = [ node(5, { "node_type" => "cistern" }), node(7, {}) ]
    assert_equal({ "5" => "electricity", "7" => nil }, Resolver.resolve(layers:, features:))
    assert_equal({ "5" => "electricity", "7" => "gas" }, Resolver.resolve(layers:, features:, overrides: { "7" => "gas" }))
  end

  test "reads CLAUDY_NETWORK_LAYERS and refuses what it cannot read" do
    assert_equal({ "5" => "water", "6" => "electric" }, Resolver.parse_overrides("5=water, 6=electric"))
    assert_equal({}, Resolver.parse_overrides(nil))
    error = assert_raises(Imports::Claudy::Error) { Resolver.parse_overrides("5=wifi") }
    assert_match "CLAUDY_NETWORK_LAYERS illisible", error.message
  end
end

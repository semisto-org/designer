ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"
require "webmock/minitest"
require_relative "test_helpers/session_test_helper"

# External providers are stubbed in tests; localhost stays reachable.
WebMock.disable_net_connect!(allow_localhost: true)

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # GeoJSON helpers for tests.
    def square(lng: 4.9, lat: 50.34, size: 0.001)
      { "type" => "Polygon", "coordinates" => [ [ [ lng, lat ], [ lng + size, lat ], [ lng + size, lat + size ], [ lng, lat + size ], [ lng, lat ] ] ] }
    end

    def point(lng: 4.9, lat: 50.34)
      { "type" => "Point", "coordinates" => [ lng, lat ] }
    end
  end
end

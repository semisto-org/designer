require_relative "teams_test_helper"

# A team granted « Territoire » and a territory on it (a square near Yvoir).
module TerritoriesTestHelper
  YVOIR = { lng: 4.88, lat: 50.31 }.freeze

  def make_territory(team, name: "Yvoir", size: 0.05, **attributes)
    team.territories.create!(name:, boundary: commune_square(size:), created_by: team.users.first, **attributes)
  end

  def commune_square(size: 0.05)
    { "type" => "Polygon", "coordinates" => [ [ [ YVOIR[:lng], YVOIR[:lat] ], [ YVOIR[:lng] + size, YVOIR[:lat] ], [ YVOIR[:lng] + size, YVOIR[:lat] + size ], [ YVOIR[:lng], YVOIR[:lat] + size ], [ YVOIR[:lng], YVOIR[:lat] ] ] ] }
  end

  def inside_point = { "type" => "Point", "coordinates" => [ YVOIR[:lng] + 0.01, YVOIR[:lat] + 0.01 ] }
end

ActiveSupport::TestCase.include TerritoriesTestHelper
ActionDispatch::IntegrationTest.include TerritoriesTestHelper

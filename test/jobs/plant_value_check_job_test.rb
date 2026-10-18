require "test_helper"

class PlantValueCheckJobTest < ActiveJob::TestCase
  test "without Jev, the species says the check failed" do
    species = PlantSpecies.create!(latin_name: "Salvia nemorossa", review_status: "proposed", values_check_requested_at: 1.minute.ago)
    previous = ENV["TYPESAFE_API_KEY"]
    ENV["TYPESAFE_API_KEY"] = nil
    PlantValueCheckJob.perform_now(species.id)
    assert_equal "not configured", species.reload.values_check_error
    assert_operator species.values_checked_at, :>, species.values_check_requested_at
  ensure
    ENV["TYPESAFE_API_KEY"] = previous
  end

  test "a species already reviewed is left alone" do
    assert_nothing_raised { PlantValueCheckJob.perform_now(plant_species(:comfrey).id) }
  end
end

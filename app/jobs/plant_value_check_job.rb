# Checks a proposed species' values against open pages with Jev
# (Catalog::ValueCheck), when a catalogue reviewer asks for it.
class PlantValueCheckJob < ApplicationJob
  queue_as :default

  def perform(species_id)
    species = PlantSpecies.proposed.find_by(id: species_id) or return
    Catalog::ValueCheck.new(species).run
  rescue Providers::Jev::Unavailable => error
    species&.update_columns(values_check_error: error.message.truncate(200), values_checked_at: Time.current)
  end
end

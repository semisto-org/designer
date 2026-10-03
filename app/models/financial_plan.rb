# The financial dashboard of a map: a 20-year model of a forest garden or
# agroforestry project (investments, costs, harvest revenue by species,
# other revenue, subsidies, carbon, loans) and its projected profit and
# loss and cash flow. Everything is an indicative estimate built from the
# user's own figures: nothing is prefilled from third-party datasets
# (in particular no data from the Dutch Rekentool).
class FinancialPlan < ApplicationRecord
  SCHEMA_VERSION = 1

  belongs_to :map
  belongs_to :updated_by, class_name: "User", optional: true

  validates :map_id, uniqueness: true

  before_validation { self.schema_version = SCHEMA_VERSION }

  # A new plan for a map, prefilled with what the map already knows: its
  # area and one line per plant of the map (quantity, names). Yields and
  # prices stay empty for the user to fill in.
  def self.build_for(map, inventory: MapPlantInventory.new(map))
    plan = new(map:)
    area_ha = map.area_m2 && (map.area_m2 / 10_000.0).round(4)
    plan.inputs = { "settings" => { "start_year" => Date.current.year + 1, "area_ha" => area_ha } }
    plan.sync_species(inventory)
    plan
  end

  # Always stored normalised (see FinancialPlan::Schema).
  def inputs=(value)
    super(Inputs.from(value).to_h)
  end

  def typed_inputs = Inputs.from(inputs)

  def area_ha_fallback = map&.area_m2 && map.area_m2 / 10_000.0

  def result = @result ||= Calculator.new(typed_inputs, area_ha: area_ha_fallback).call

  def reload(*)
    @result = nil
    super
  end

  # Brings the plants of the map into the plan: new plants get a line,
  # existing lines (matched by source key) get the map's quantity; every
  # other value the user entered is kept. Returns { added:, updated: }.
  def sync_species(inventory)
    document = typed_inputs
    lines = document.species.index_by(&:source_key)
    added = updated = 0
    inventory.lines.each do |plant|
      if (line = lines[plant.key])
        next if line.quantity == plant.quantity
        line.quantity = plant.quantity
        updated += 1
      else
        document.species << Schema::SpeciesLine.from(species_attributes(plant))
        added += 1
      end
    end
    self.inputs = document.to_h
    { added:, updated: }
  end

  private
    def species_attributes(plant)
      {
        "source_key" => plant.key,
        "name" => plant.name,
        "latin_name" => plant.latin_name,
        "quantity" => plant.quantity,
        "planting_year" => 1,
        "first_harvest_age" => catalogue_value(plant.species, :production_start_year),
        "full_production_age" => catalogue_value(plant.species, :maturity_years)
      }
    end

    # Growth timing from Semisto's own plant catalogue, when filled in and
    # not of restricted provenance.
    def catalogue_value(species, field)
      return nil unless species.respond_to?(field)
      value = species.public_send(field)
      return nil if value.blank?
      provenance = species.respond_to?(:provenance_for) ? species.provenance_for(field) : nil
      return nil if provenance.to_s.downcase.include?("rekentool")
      value
    rescue StandardError
      nil
    end
end

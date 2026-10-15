# Gives every plant already on a map its number (MapFeature::PlantNumber):
# the one written at the start of its name when there is one (plans
# numbered before Designer, such as the Claudy import), else the next free
# one, in the order the plants were placed.
class NumberPlants < ActiveRecord::Migration[8.1]
  class Feature < ActiveRecord::Base
    self.table_name = "map_features"
  end

  # « 27 · Toona sinensis », « 27. Toona », « 93 ? · à identifier »: a number
  # already written at the start of a plant's name.
  NAME_NUMBER = /\A\s*(\d{1,6})\s*\??\s*[·.\-–:]\s*/

  def up
    plants = Feature.where(kind: "plant").order(:map_id, :created_at, :id).select(:id, :map_id, :name, :properties)
    plants.group_by(&:map_id).each_value do |features|
      numbers = {}
      taken = Set.new
      features.each do |feature|
        number = feature.name.to_s[NAME_NUMBER, 1]&.to_i
        next unless number&.positive? && taken.add?(number)
        numbers[feature.id] = number
      end
      following = taken.max.to_i
      features.each { |feature| numbers[feature.id] ||= (following += 1) }
      features.each do |feature|
        properties = (feature.properties || {}).merge("number" => numbers[feature.id])
        Feature.where(id: feature.id).update_all(properties:)
      end
    end
  end

  def down
    execute "UPDATE map_features SET properties = properties - 'number' WHERE kind = 'plant'"
  end
end

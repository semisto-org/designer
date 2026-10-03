# Botanical plurals the default English rules get wrong: "plant_species"
# would classify as "PlantSpecy" and "genus" pluralise as "genus".
ActiveSupport::Inflector.inflections(:en) do |inflect|
  inflect.irregular "genus", "genera"
  inflect.uncountable %w[plant_species]
end

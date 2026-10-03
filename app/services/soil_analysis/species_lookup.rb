module SoilAnalysis
  # Looks species up in the plant catalogue (PlantSpecies), which another
  # feature area builds: everything here is defensive and answers "nothing"
  # while the model, its table or the expected columns are missing.
  module SpeciesLookup
    NAME_COLUMNS = %w[common_name_fr common_name name_fr name].freeze
    LATIN_COLUMNS = %w[latin_name scientific_name].freeze

    module_function

    def model
      return nil unless Object.const_defined?(:PlantSpecies)
      klass = ::PlantSpecies
      klass if klass < ActiveRecord::Base && klass.table_exists?
    rescue NameError, LoadError, ActiveRecord::ActiveRecordError
      nil
    end

    def available? = !model.nil?

    # [{ id:, name:, latin: }]
    def search(query, limit: 8)
      klass = model or return []
      name_column = (NAME_COLUMNS & klass.column_names).first
      latin_column = (LATIN_COLUMNS & klass.column_names).first
      columns = [ name_column, latin_column ].compact
      return [] if columns.empty? || query.to_s.strip.length < 2

      pattern = "%#{klass.sanitize_sql_like(query.to_s.strip)}%"
      conditions = columns.map { |column| "#{klass.connection.quote_column_name(column)} ILIKE :pattern" }.join(" OR ")
      klass.where(conditions, pattern:).limit(limit).map do |species|
        { id: species.id, name: name_column ? species[name_column] : species[latin_column], latin: latin_column ? species[latin_column] : nil }
      end
    rescue ActiveRecord::ActiveRecordError
      []
    end
  end
end

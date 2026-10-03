module Mcp
  # Bridge to the plant catalogue (PlantSpecies, built by the plants
  # feature). Until the catalogue exists, plant tools answer that it is not
  # available yet.
  module PlantCatalog
    class Unavailable < StandardError; end

    MODEL_NAMES = %w[PlantSpecies Plant::Species].freeze
    SEARCH_COLUMNS = %w[latin_name common_names_fr common_name name french_name].freeze
    PRIVATE_COLUMNS = /(email|token|digest|password|user_id|_by_id|audited)/

    def self.model
      MODEL_NAMES.each do |name|
        klass = name.safe_constantize
        return klass if klass.is_a?(Class) && klass < ActiveRecord::Base && klass.table_exists?
      end
      nil
    end

    def self.available? = model.present?

    def self.search(query, limit:)
      klass = model or raise Unavailable
      scope =
        if klass.respond_to?(:matching) then klass.matching(query)
        elsif klass.respond_to?(:search) then klass.search(query)
        else ilike(klass, query)
        end
      scope.limit(limit).map { |record| serialize(record, full: false) }
    end

    def self.find(id)
      klass = model or raise Unavailable
      record = klass.find_by(id:)
      record && serialize(record, full: true)
    end

    def self.ilike(klass, query)
      columns = SEARCH_COLUMNS & klass.column_names
      return klass.none if columns.empty?
      pattern = "%#{klass.sanitize_sql_like(query)}%"
      conditions = columns.map { |c| "#{klass.connection.quote_column_name(c)}::text ILIKE :pattern" }.join(" OR ")
      klass.where(conditions, pattern:).order(columns.first)
    end

    # The catalogue's own API representation when it has one (it carries
    # per-field provenance), otherwise its public columns.
    def self.serialize(record, full:)
      %i[as_mcp as_api].each { |m| return record.public_send(m, full:) if record.respond_to?(m) && record.method(m).arity != 0 }
      %i[as_mcp as_api].each { |m| return record.public_send(m) if record.respond_to?(m) }
      attributes = record.attributes.reject { |k, _| k.match?(PRIVATE_COLUMNS) }
      full ? attributes : attributes.slice(*(%w[id] + SEARCH_COLUMNS + %w[family plant_type strate]))
    end
  end
end

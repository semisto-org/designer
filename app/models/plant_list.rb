require "csv"

# The plant list of a map: what to order and plant, one row per species or
# cultivar, from individual plants and patch compositions (PlantedQuantities).
# Used by the « Liste de plants » panel, its CSV and printable page, and by
# other areas (nursery order, MCP) through `map.plant_list`.
#
#   map.plant_list.rows.first
#   # => #<data PlantList::Row species_id=12, variety_id=nil, latin_name="Malus domestica",
#   #     common_name="Pommier", strata="sub_canopy", isolated=3, composed=0, total=3, …>
class PlantList
  Row = Data.define(:species_id, :variety_id, :latin_name, :common_name, :variety_name, :strata,
                    :isolated, :composed, :total, :placed, :planted, :patches, :height_m, :spread_m) do
    def as_json(*)
      {
        speciesId: species_id, varietyId: variety_id, latinName: latin_name, commonName: common_name,
        varietyName: variety_name, strata:, isolated:, composed:, total:, placed:, planted:,
        patches:, heightM: height_m, spreadM: spread_m
      }
    end
  end

  CSV_COLUMNS = %i[strata latin_name variety_name common_name isolated composed total height_m spread_m].freeze

  attr_reader :quantities

  delegate :total, :unlinked_count, :planted_total, :placed_total, to: :quantities

  def initialize(quantities)
    @quantities = quantities
  end

  def rows
    @rows ||= quantities.by_key.filter_map { |key, slot| build_row(key, slot) if slot.planned.positive? }
                        .sort_by { |row| [ PlantVocabulary::STRATA.index(row.strata) || 99, row.latin_name.downcase ] }
  end

  def species_count = rows.map(&:species_id).uniq.size

  def as_json(*)
    {
      rows: rows.map(&:as_json), total:, speciesCount: species_count, lines: rows.size,
      planted: planted_total, placed: placed_total, unlinked: unlinked_count
    }
  end

  # Semicolon-separated with a BOM: opens as columns in a French Excel.
  def to_csv
    headers = CSV_COLUMNS.map { |column| I18n.t("plant_list.columns.#{column}") }
    "﻿" + CSV.generate(col_sep: ";") do |csv|
      csv << headers
      rows.each do |row|
        csv << CSV_COLUMNS.map do |column|
          value = row.public_send(column)
          case column
          when :strata then I18n.t("plants.strata.#{value}", default: value.to_s)
          when :height_m, :spread_m then value && format("%.2f", value).sub(".", ",")
          else value
          end
        end
      end
    end
  end

  private
    def build_row(key, slot)
      species = quantities.species_index[key.first] or return nil
      variety = key.last && quantities.variety_index[key.last]
      strata = quantities.strata_for(key) || species.default_strata
      Row.new(
        species_id: species.id, variety_id: variety&.id,
        latin_name: variety ? variety.full_latin_name : species.latin_name,
        common_name: variety&.common_name || species.common_name, variety_name: variety&.name, strata:,
        isolated: slot.isolated, composed: slot.composed, total: slot.planned, placed: slot.placed,
        planted: slot.planted, patches: slot.patch_ids.size,
        height_m: species.adult_height(strata).metres, spread_m: species.adult_spread(strata).metres
      )
    end
end

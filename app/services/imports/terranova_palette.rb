require "csv"

module Imports
  # Imports the plant palette of a Terranova design project into a Designer
  # map, from Terranova's palette export (« Exporter » in the palette, CSV,
  # any view that has the « Nom latin » column, or « Nom » for the others).
  #
  # Species and cultivars are matched on the catalogue by latin name
  # (Imports::Claudy::SpeciesMatcher: authors, case, accents, synonyms).
  # A palette entry the map already has is left as it is. With
  # `create_missing`, a species or cultivar the catalogue lacks is created
  # with its latin and French names only, provenance « terranova » to verify
  # (a later `catalog:import_terranova` completes it, matched by latin name).
  #
  # Dry run by default: nothing is written until `apply: true`.
  class TerranovaPalette
    SOURCE = "terranova".freeze

    # Terranova's French strata labels (config/locales/fr.yml, `strata:`).
    STRATA_LABELS = {
      "canopee" => "canopy", "arboree basse" => "sub_canopy", "arbustive" => "shrub", "herbacee" => "herbaceous",
      "couvre-sol" => "ground_cover", "couvre sol" => "ground_cover", "grimpantes" => "vine", "grimpante" => "vine",
      "rhizosphere" => "root", "aquatique" => "aquatic"
    }.freeze

    COLUMNS = {
      latin: [ "nom latin", "latin" ],
      name: [ "nom commun", "nom", "common_name", "name" ],
      strata: [ "strate", "strata" ],
      quantity: [ "prevu (plants)", "quantity" ]
    }.freeze

    Line = Struct.new(:row, :latin, :name, :strata, :quantity, :species, :variety, :cultivar, :outcome, keyword_init: true)

    attr_reader :map, :lines

    def initialize(map:, csv:, apply: false, create_missing: false, user: nil)
      @map = map
      @csv = csv
      @apply = apply
      @create_missing = create_missing
      @user = user || map.owner
      @lines = []
    end

    def call
      rows = parse
      matcher = Claudy::SpeciesMatcher.new
      ActiveRecord::Base.transaction do
        rows.each_with_index { |row, index| @lines << import(row, index + 2, matcher) }
        raise ActiveRecord::Rollback unless @apply
      end
      self
    end

    def counts = lines.group_by(&:outcome).transform_values(&:size)

    def report
      out = [ "#{@apply ? 'Imported' : 'DRY RUN (nothing written)'} — map #{map.id} « #{map.name} », #{lines.size} lines" ]
      counts.sort.each { |outcome, n| out << "  #{outcome}: #{n}" }
      lines.each do |line|
        target = line.species ? "#{line.species.latin_name}#{" '#{line.variety&.name || line.cultivar}'" if line.variety || line.cultivar}" : "—"
        out << format("  [%-22s] row %-3d %-45s → %s%s", line.outcome, line.row, (line.latin || line.name).to_s.truncate(45),
                      target, line.strata ? " (#{line.strata})" : "")
      end
      out.join("\n")
    end

    private
      def parse
        text = PlantVocabulary.utf8(@csv).delete_prefix("﻿")
        separator = text.lines.first.to_s.count(";") > text.lines.first.to_s.count(",") ? ";" : ","
        table = CSV.parse(text, headers: true, col_sep: separator)
        index = table.headers.each_with_index.to_h { |header, i| [ fold(header), i ] }
        columns = COLUMNS.transform_values { |names| names.lazy.map { |n| index[n] }.find(&:itself) }
        raise ArgumentError, "No « Nom latin » nor « Nom » column in the export" unless columns[:latin] || columns[:name]
        table.map { |row| columns.transform_values { |i| i && row[i].to_s.squish.presence } }
             .reject { |row| row[:latin].nil? && row[:name].nil? }
      end

      def import(row, number, matcher)
        latin = row[:latin] || row[:name]
        line = Line.new(row: number, latin: row[:latin], name: row[:name], strata: strata(row[:strata]),
                        quantity: row[:quantity]&.to_i&.then { |q| q.positive? ? q : nil })
        match = matcher.match(latin_name: row[:latin], name: row[:name])
        line.cultivar = match&.cultivar || Claudy::SpeciesMatcher.cultivar(latin)
        line.species = match&.species
        line.variety = match&.variety

        if line.species.nil?
          return finish(line, "species_missing") unless @create_missing && Claudy::SpeciesMatcher.binomial(latin)
          line.species = existing_species(latin) || create_species(latin, line).tap { line.outcome = "species_created" }
        end
        if line.variety.nil? && line.cultivar.present?
          return finish(line, "variety_missing") unless @create_missing
          line.variety = create_variety(line.species, line.cultivar)
          line.outcome ||= "variety_created"
        end

        if map.palette_items.exists?(species_id: line.species.id, variety_id: line.variety&.id)
          return finish(line, line.outcome || "already_in_palette")
        end
        map.palette_items.create!(species: line.species, variety: line.variety, created_by: @user,
                                  strata: line.strata == line.species.default_strata ? nil : line.strata,
                                  target_count: line.quantity)
        finish(line, line.outcome || "added")
      end

      def finish(line, outcome)
        line.outcome = outcome
        line
      end

      # The matcher indexes the catalogue once: a species created by an earlier
      # row (« Mentha spicata », then « Mentha spicata 'Nanah' ») or one it could
      # not pick among look-alikes is found here by its exact name.
      def existing_species(latin)
        PlantSpecies.where("lower(latin_name) = ?", species_name(latin).downcase).first
      end

      def species_name(latin)
        Claudy::SpeciesMatcher.binomial(latin).sub(/\A(x )?(\p{L})/) { "#{$1 && '× '}#{$2.upcase}" }.sub(" x ", " × ")
      end

      def create_species(latin, line)
        latin_name = species_name(latin)
        genus = PlantGenus.where("lower(latin_name) = ?", latin_name.delete_prefix("× ").split.first.downcase).first
        species = PlantSpecies.new(latin_name:, genus:)
        common = line.name if line.name && line.name != latin && line.cultivar.nil?
        writer.write(species, { strata: line.strata }, common_names: common)
        species
      end

      def create_variety(species, cultivar)
        species.varieties.reset
        species.varieties.where("lower(name) = ?", cultivar.downcase).first || species.varieties.create!(name: cultivar)
      end

      def writer = @writer ||= Catalog::SpeciesWriter.new(source: SOURCE, status: "to_verify")

      def strata(label)
        return nil if label.blank?
        key = fold(label)
        PaletteItem::STRATA.include?(key) ? key : STRATA_LABELS[key]
      end

      def fold(text) = Claudy::SpeciesMatcher.fold(text)
  end
end

module Imports
  module Claudy
    # Brings the plan of a Claudy map (Les 4 Sources) into an existing
    # Designer map: zones, paths and points, networks (sensitive layer),
    # trial designs, own biodiversity records, bio-indicator records, plants
    # (linked to the catalogue, with palette items), sketches and photos.
    # See Mapping for what goes where, and docs/import-claudy.md.
    #
    # Re-runnable. Each imported record is marked in its properties
    # (`import: { source: "claudy", type:, id: }`) and in the ImportRecord
    # ledger, with a fingerprint of what the import wrote. A second run
    # updates what nobody touched since, leaves alone what was edited or
    # deleted in Designer (unless `force`), and never touches what was drawn
    # in Designer. Deletions in Claudy are not mirrored.
    #
    # `dry_run` runs everything in a transaction rolled back at the end
    # (photos are counted, not downloaded).
    class Importer
      SOURCE = "claudy".freeze
      FALLBACK_ERRORS = %i[element_geometry element_property element_layer].freeze

      attr_reader :map, :source, :report

      def initialize(map:, source:, dry_run: false, photos: true, force: false, network_layers: {}, matcher: nil)
        @map = map
        @source = source
        @dry_run = dry_run
        @photos = photos
        @force = force
        @network_layers = network_layers
        @matcher = matcher
        @report = Report.new(map:, source_label: source.label, dry_run:, photos_enabled: photos)
      end

      def dry_run? = @dry_run
      def force? = @force

      # The Report. A Claudy that stops answering midway raises Error after
      # noting it in the report: what was written stays (a re-run resumes).
      def call
        if dry_run?
          ActiveRecord::Base.transaction do
            run
            raise ActiveRecord::Rollback
          end
        else
          run
        end
        report
      rescue Error => error
        report.aborted = error.message
        raise
      end

      private
        def run
          @ledger = ImportRecord.where(map:, source: SOURCE).index_by { |entry| [ entry.external_type, entry.external_id ] }
          @matcher ||= SpeciesMatcher.new
          @palette = {}
          features = source.map_features
          @networks = NetworkResolver.resolve(layers: source.map_layers, features:, overrides: @network_layers)

          features.each { |row| guard("map_feature", row) { import_feature(row) } }
          source.plants.each { |row| guard("plant", row) { import_plant(row) } }
          if source.sketches.nil?
            report.sketches_available = false
          else
            source.sketches.each { |row| guard("sketch", row) { import_sketch(row) } }
          end
          ensure_palette
        end

        # One record's failure is reported, the others go on.
        def guard(type, row)
          ActiveRecord::Base.transaction(requires_new: true) { yield }
        rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique, ActiveRecord::StaleObjectError => error
          report.error(type:, id: row["id"], name: row["name"], message: error.message)
        end

        # --- Features -------------------------------------------------------

        def import_feature(row)
          network = @networks[row["layer_id"].to_s] if row["layer_kind"] == "network"
          outline = Mapping.feature(row, network:)
          return skipped(outline) if outline.is_a?(Mapping::Skip)

          report.unknown_network(row["layer_id"]) if row["layer_kind"] == "network" && network.nil?
          detail = source.feature_detail(row)
          count_tasks(detail)
          target = Mapping.feature(row, network:, detail:)
          feature = write_feature("map_feature", row, target)
          return unless feature
          import_photos(detail, feature)
          import_bioindicator_species(row, feature) if row["layer_kind"] == "bioindicators"
        end

        def import_plant(row)
          match = species_match(row)
          unless row["status"] == "dead"
            remember_palette(row, match)
            note_unmatched(row, match)
          end
          outline = Mapping.plant(row, match:)
          return skipped(outline) if outline.is_a?(Mapping::Skip)

          detail = source.plant_detail(row)
          count_tasks(detail)
          feature = write_feature("plant", row, Mapping.plant(row, match:, detail:))
          import_photos(detail, feature) if feature
        end

        def import_sketch(row)
          target = Mapping.sketch(row)
          return skipped(target) if target.is_a?(Mapping::Skip)
          write_feature("sketch", row, target)
        end

        def skipped(skip)
          report.skip(skip.reason) unless skip.reason == :plant_point # imported through its plant
        end

        def count_tasks(detail)
          tasks = Array(detail.to_h["tasks"])
          report.skip(:tasks, tasks.size) if tasks.any?
        end

        # Creates or updates the feature of an upstream record; nil when it
        # was deleted in Designer (and not forced back).
        def write_feature(type, row, target)
          entry = @ledger[[ type, row["id"].to_s ]]
          existing = map.features.find_by(id: entry.record_id) if entry&.record_type == "MapFeature"
          return keep(:deleted) if entry&.record_id && existing.nil? && !force?
          return keep(:edited, existing) if existing && !force? && feature_digest(existing) != entry.digest

          feature = existing || map.features.new
          assign(feature, target, type, row)
          fallback = fall_back(feature, target, type, row) unless feature.valid?
          if existing && feature_digest(feature) == entry.digest
            report.count(feature.layer, feature.kind, :unchanged)
            return feature
          end

          outcome = feature.new_record? ? :created : :updated
          feature.save!
          report.warn(fallback) if fallback
          record!(type, row["id"], feature, feature_digest(feature.reload))
          report.count(feature.layer, feature.kind, outcome)
          feature
        end

        def assign(feature, target, type, row)
          feature.assign_attributes(
            layer: target.layer, kind: target.kind, name: target.name, notes: target.notes,
            status: "active", source: "human", geometry: target.geometry,
            properties: target.properties.merge("import" => { "source" => SOURCE, "type" => type, "id" => row["id"] })
          )
        end

        # A geometry or a value the element library refuses: the generic
        # shape of the same layer (zone, line or point) rather than nothing.
        def fall_back(feature, target, type, row)
          codes = feature.errors.details[:base].map { |detail| detail[:error] }
          generic = Mapping.generic_kind(target.geometry)
          return nil if (codes & FALLBACK_ERRORS).empty? || target.kind == generic
          reason = feature.errors.full_messages.to_sentence
          assign(feature, target.with(kind: generic, properties: target.properties.compact), type, row)
          I18n.t("claudy_import.report.fallback", name: target.name.presence || I18n.t("claudy_import.report.unnamed"),
                 type:, id: row["id"], kind: MapElements.label(target.kind), reason:, generic: MapElements.label(generic))
        end

        def keep(reason, record = nil)
          report.keep(reason)
          record
        end

        # SHA-256 of what the import controls on a feature. Geometry through
        # GeoJSON: the same doubles before and after the database round trip.
        def feature_digest(feature)
          digest(layer: feature.layer, kind: feature.kind, name: feature.name, notes: feature.notes,
                 status: feature.status, properties: feature.properties, geometry: feature.geometry_geojson)
        end

        def digest(values) = Digest::SHA256.hexdigest(JSON.generate(sorted(values)))

        def sorted(value)
          case value
          when Hash then value.to_h { |k, v| [ k.to_s, sorted(v) ] }.sort.to_h
          when Array then value.map { |v| sorted(v) }
          else value
          end
        end

        def record!(type, id, record, digest)
          entry = @ledger[[ type, id.to_s ]] ||= ImportRecord.new(map:, source: SOURCE, external_type: type, external_id: id.to_s)
          entry.update!(record:, digest:, imported_at: Time.current)
        end

        # --- Plants and palette ---------------------------------------------

        def species_match(row)
          species = row["species"]
          return nil unless species.is_a?(Hash)
          variety = row["variety"].is_a?(Hash) ? row["variety"]["name"] : nil
          @matcher.match(latin_name: species["latin_name"], name: species["name"], variety:)
        end

        def note_unmatched(row, match)
          if match.nil?
            name, latin = Mapping.unmatched_species(row).values_at("name", "latin_name")
            label = name || latin || I18n.t("claudy_import.report.no_species_name")
            label += " (#{latin})" if name && latin && latin != name
            report.unmatched_species[label] += 1
          elsif match.variety.nil? && match.cultivar.present?
            report.unmatched_varieties["#{match.species.latin_name} « #{match.cultivar} »"] += 1
          end
        end

        def remember_palette(row, match)
          return unless match
          (@palette[[ match.species.id, match.variety&.id ]] ||= []) << Mapping.strata(row["stratum"])
        end

        # A palette item per species or cultivar of the imported plants, when
        # the map does not have it yet. The Claudy stratum is kept when all the
        # plants agree and it differs from the species' own.
        def ensure_palette
          @palette.each do |(species_id, variety_id), strata|
            next if map.palette_items.exists?(species_id:, variety_id:)
            species = PlantSpecies.find(species_id)
            chosen = strata.compact.uniq
            map.palette_items.create!(species:, variety_id:,
                                      strata: chosen.one? && chosen.first != species.default_strata ? chosen.first : nil)
            report.palette_created += 1
          rescue ActiveRecord::RecordInvalid => error
            report.error(type: "palette", id: species_id, name: species&.latin_name, message: error.message)
          end
        end

        # --- Bio-indicators -------------------------------------------------

        def import_bioindicator_species(row, feature)
          location = feature.geometry if feature.geometry&.geometry_type == RGeo::Feature::Point
          Mapping.bioindicator_species(row).each do |attrs|
            guard("bioindicator", row) { write_observation("bioindicator_species", "#{row['id']}:#{attrs[:key]}", attrs, location) }
          end
        end

        def write_observation(type, id, attrs, location)
          entry = @ledger[[ type, id ]]
          existing = map.bioindicator_observations.find_by(id: entry.record_id) if entry&.record_type == "BioindicatorObservation"
          return keep(:deleted) if entry&.record_id && existing.nil? && !force?
          return keep(:edited) if existing && !force? && observation_digest(existing) != entry.digest

          observation = existing || map.bioindicator_observations.new
          latin = attrs[:latin_name]
          observation.assign_attributes(
            species_name: attrs[:species_name], latin_name: latin, abundance: attrs[:abundance],
            observed_on: attrs[:observed_on], notes: attrs[:notes], location:,
            catalog_key: catalog_key(latin || attrs[:species_name]), plant_species_id: latin && @matcher.find_species(latin)&.id
          )
          if existing && observation_digest(observation) == entry.digest
            return report.count(*Report::OBSERVATION_KIND, :unchanged)
          end
          outcome = observation.new_record? ? :created : :updated
          observation.save!
          record!(type, id, observation, observation_digest(observation.reload))
          report.count(*Report::OBSERVATION_KIND, outcome)
        end

        def observation_digest(observation)
          digest(species_name: observation.species_name, latin_name: observation.latin_name, abundance: observation.abundance,
                 observed_on: observation.observed_on&.iso8601, notes: observation.notes, catalog_key: observation.catalog_key,
                 plant_species_id: observation.plant_species_id, location: observation.lnglat)
        end

        def catalog_key(latin)
          @catalog_keys ||= SoilAnalysis::BioindicatorCatalog.all.to_h { |entry| [ SpeciesMatcher.canonical(entry["latin"]), entry["key"] ] }
          @catalog_keys[SpeciesMatcher.canonical(latin)]
        end

        # --- Photos ---------------------------------------------------------

        def import_photos(detail, feature)
          return unless @photos
          Array(detail.to_h["photos"]).grep(Hash).each { |photo| import_photo(photo, feature) }
        end

        # A photo becomes a MapPhoto of the map, linked to the feature and
        # placed on it when it is a point. Imported once (ledger), whatever
        # happens to it afterwards.
        def import_photo(photo, feature)
          return report.photo(:known) if @ledger[[ "photo", photo["id"].to_s ]]
          declared = photo["content_type"].to_s
          return report.photo(:unsupported) if declared.present? && !MapPhoto::CONTENT_TYPES.include?(declared)
          return report.photo(:too_large) if photo["byte_size"].to_i > MapPhoto::MAX_BYTES
          return report.photo(:planned) if dry_run?

          file = source.photo_file(photo, max_bytes: MapPhoto::MAX_BYTES)
          type = Marcel::MimeType.for(StringIO.new(file.body), name: file.filename, declared_type: file.content_type.presence)
          return report.photo(:unsupported) unless MapPhoto::CONTENT_TYPES.include?(type)

          map_photo = new_photo(photo, feature)
          map_photo.image.attach(io: StringIO.new(file.body), filename: photo["filename"].presence || file.filename, content_type: type)
          if map_photo.save
            record!("photo", photo["id"], map_photo, nil)
            report.photo(:created)
          elsif map_photo.errors.of_kind?(:base, :already_imported)
            record!("photo", photo["id"], nil, nil)
            report.photo(:duplicate)
          else
            photo_failed(map_photo.errors.full_messages.to_sentence)
          end
        rescue Error => error
          photo_failed(error.message)
        end

        def new_photo(photo, feature)
          point = feature.geometry if feature.geometry&.geometry_type == RGeo::Feature::Point
          caption = feature.name.present? ? I18n.t("claudy_import.photos.caption", name: feature.name) : I18n.t("claudy_import.photos.caption_unnamed")
          taken_at = Time.zone.parse(photo["created_at"].to_s) rescue nil
          map.photos.new(source: "import", map_feature: feature, caption: caption.truncate(500), taken_at:,
                         location: point, location_source: point ? "map" : nil)
        end

        def photo_failed(message)
          report.photo(:failed)
          report.warn(message)
        end
    end
  end
end

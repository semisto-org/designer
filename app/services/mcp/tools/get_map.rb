module Mcp
  module Tools
    class GetMap < Base
      arguments(
        properties: { map_id: { type: "integer", minimum: 1, description: :map_id } },
        required: %w[map_id]
      )
      hints

      def perform(map_id:)
        map = find_map!(map_id)
        entitlements = Entitlements.for_map(map)
        blockers = []
        blockers << "scope" unless principal.drafts?
        blockers << "role" unless editor?
        blockers << "plan" unless entitlements.ai_drafts?
        blockers << "boundary" if map.boundary.nil?
        {
          id: map.id, name: map.name, description: map.description, address: map.address, url: map_url(map),
          role: @role, stage: map.stage, stage_label: I18n.t("maps.stages.#{map.stage}", default: map.stage),
          region: { key: map.region.key, name: map.region.name, country_code: map.region.country_code },
          area_m2: map.area_m2 || (map.boundary && map.measure_geometry(:boundary)["area"]),
          centroid: centroid(map),
          bbox: map.bbox&.map { |v| v.round(Geo::PRECISION) },
          boundary: Geo.encode(map.boundary),
          parcels: map.parcels,
          project: map.project,
          project_percent: map.project_sheet.progress[:percent],
          project_drafts_pending: map.project_sheet_drafts.count,
          elements: element_counts(map),
          tags: tag_counts(map),
          palette: palette(map),
          palette_drafts_pending: map.palette_drafts.count,
          place: place(map),
          bioindicators: bioindicators(map),
          soil_samples: soil_samples(map),
          tasks: {
            pending: map.tasks.pending.count, overdue: map.tasks.overdue.count, done: map.tasks.done.count,
            mine_pending: map.tasks.pending.where(assignee: user).count
          },
          documents: map.documents.count,
          photos: map.photos.count,
          observation_year: MapFeature::SeasonSign.observation_year(map),
          offer: offer(map),
          publication: publication(map),
          implementation: implementation(map),
          known_kinds: I18n.t("editor.kinds", default: {}),
          layers: MapFeature::LAYERS.index_with { |layer| I18n.t("editor.layers.#{layer}", default: layer) },
          permissions: {
            read: true,
            propose_drafts: blockers.empty?,
            propose_drafts_blocked_by: blockers.map { |b| t("permissions.#{b}") },
            write_tasks_documents_photos: write_blockers(map).empty?,
            drafts_trial_ends_at: entitlements.ai_trial_ends_at&.iso8601,
            drafts_trial_note: trial_note(entitlements)
          }.compact,
          limits: {
            max_features_per_proposal: DraftProposal::MAX_FEATURES,
            max_pending_drafts: DraftProposal::MAX_PENDING,
            proposal_buffer_m: DraftProposal::BUFFER_M,
            max_updates_per_proposal: UpdateProposal::MAX_UPDATES,
            max_elements_per_update_filter: UpdateProposal::MAX_FILTERED,
            max_plants_per_palette_proposal: PaletteProposal::MAX_PLANTS,
            max_answers_per_project_proposal: ProjectSheetProposal::MAX_ANSWERS
          }
        }
      end

      private
        MAX_BIOINDICATORS = 100

        # The public view (« Publier »), for the owner only, as in the editor:
        # its address, whether the map changed since the snapshot, and what
        # it brought (views, trials started from « Et chez toi ? », accounts
        # opened after it). Numbers, never names. Publishing stays a gesture
        # of the owner in the panel.
        def publication(map)
          return nil unless @role == "owner"
          publication = map.publication or return { published: false, note: t("notes.publication_none") }
          {
            published: publication.live?, url: "#{origin}#{publication.public_path}", title: publication.title,
            version: publication.version, published_at: publication.published_at.iso8601,
            unpublished_at: publication.unpublished_at&.iso8601, stale: publication.stale?,
            shown_layers: publication.options["feature_layers"], hides_address: publication.options["hide_address"],
            views: publication.views_count, places_tried: publication.trials.count, gardens_started: publication.sourced_users.count,
            note: t("notes.publication")
          }.compact
        end

        # The implementation plan (« Mise en œuvre »): its phases in order,
        # with their season, workload and cost, and how much work is still
        # in no phase. An element joins a phase through its `phase_id`
        # property (propose_feature_updates); get_implementation_plan has the detail.
        def implementation(map)
          plan = Implementation::Plan.new(map, networks: editor?).as_json
          {
            phases: plan[:phases].map do |phase|
              { id: phase[:id], name: phase[:name], starts_on: phase[:startsOn], ends_on: phase[:endsOn], notes: phase[:notes],
                hours: phase[:hours][:total], hours_available: phase.dig(:available, :hours), cost_cents: phase[:costCents],
                done: phase[:done], count: phase[:count], advice: phase[:advice].map { _1[:code] } }
            end,
            proposed_phases_pending: plan[:drafts].size,
            not_in_a_phase: plan[:unassigned][:groups].sum { _1[:count] },
            drawn_as_existing: plan[:drawnAsExisting].size,
            hours_total: plan[:totals][:hours], cost_cents_total: plan[:totals][:costCents]
          }
        end

        # The offer's versions and the budget of the last accepted one, for
        # the team that priced it (never a viewer: the client may be one).
        # Semisto's internal app reads it to set a design project's planned
        # budget against the hours worked. HTVA is what VAT leaves of each
        # part at its own rate (services, plants, supplies).
        def offer(map)
          return nil unless editor? && Offer.shown_to?(map, user)
          offer = map.offer or return nil
          versions = offer.versions.to_a
          accepted = versions.select { _1.status == "accepted" }.max_by(&:number)
          {
            url: "#{map_url(map)}/offer",
            versions: versions.map { { number: _1.number, label: _1.label, status: _1.status, saved_at: _1.created_at.iso8601 } },
            accepted: accepted && offer_budget(accepted)
          }
        end

        def offer_budget(version)
          totals = version.result["totals"] || {}
          plants = version.result["plants"] || {}
          settings = version.inputs["settings"] || {}
          htva = ->(tvac, kind) { tvac.to_f / (1 + settings.fetch("vat_#{kind}_pct", 0).to_f / 100) }
          services_htva = htva.(totals["services_price_tvac"], :services)
          plants_htva = htva.(plants["plants_base_tvac"], :plants) + htva.(plants["supplies_base_tvac"], :supplies)
          phases = version.result["phases"] || []
          {
            number: version.number, label: version.label, note: version.note, pricing_name: version.pricing_name,
            accepted_at: version.updated_at.iso8601,
            total_tvac: totals["total_tvac"], total_htva: (services_htva + plants_htva).round(2),
            services_tvac: totals["services_price_tvac"], services_htva: services_htva.round(2),
            plants_supplies_tvac: totals["plants_supplies_base_tvac"], plants_supplies_htva: plants_htva.round(2),
            design_tvac: totals["design_tvac"], implementation_tvac: totals["implementation_tvac"],
            hours_min: phases.sum { _1["hours_min"].to_f }.round(1), hours_max: phases.sum { _1["hours_max"].to_f }.round(1),
            phases: phases.map { { key: _1["key"], price_tvac: _1["price_tvac"], hours_min: _1["hours_min"], hours_max: _1["hours_max"] } }
          }
        end

        # Wild plants noted on the terrain (by hand, from a photo identified by
        # Pl@ntNet, or accepted from an AI's proposal), what the curated list
        # says they point to, and the photos of wild plants waiting for an AI
        # to read them (get_bioindicator_photo, then propose_bioindicators).
        def bioindicators(map)
          observations = map.bioindicator_observations.active.recent.to_a
          {
            observations: observations.first(MAX_BIOINDICATORS).map do |observation|
              {
                name: observation.species_name, latin_name: observation.latin_name, abundance: observation.abundance, cover_percent: observation.cover_percent,
                observed_on: observation.observed_on&.iso8601, location: observation.lnglat&.map { |v| v.round(Geo::PRECISION) },
                indicators: observation.indicators, unverified: observation.unverified_indicators,
                photo_id: observation.map_photo_id, notes: observation.notes
              }
            end,
            summary: SoilAnalysis::BioindicatorCatalog.tally(observations),
            drafts_pending: map.bioindicator_observations.drafts.count,
            photos: map.photos.for_bioindicators.chronological.limit(MAX_BIOINDICATORS).map do |photo|
              {
                photo_id: photo.id, status: photo.bioindicator_status, taken_at: photo.taken_at&.iso8601,
                location: photo.lnglat&.map { |v| v.round(Geo::PRECISION) }, caption: photo.caption
              }
            end
          }
        end

        # How many sampling points, how many carry lab reports, and how many
        # wait for the review of values an AI read (get_soil_samples).
        def soil_samples(map)
          samples = map.soil_samples.with_attached_lab_reports.to_a
          {
            total: samples.size, analysed: samples.count(&:analysed?),
            with_reports: samples.count { |s| s.lab_reports.attached? },
            drafts_pending: samples.count { |s| s.draft.pending? }
          }
        end

        # Who owns the place and what they chose to share with other
        # gardeners (MapPlaceOwners); only they change it, in « Partager ».
        def place(map)
          owners = map.memberships.where(place_owner: true).includes(:user).order(:created_at).map(&:user)
          you = owners.any? { _1.id == user.id }
          {
            owners: owners.map(&:display_name), you:,
            shares_planted_palette: map.shares_planted_palette,
            accepts_propagation_requests: map.accepts_propagation_requests,
            pending_requests: (map.propagation_requests.pending.count if you)
          }.compact
        end

        # The species chosen for this terrain (accepted entries only).
        def palette(map)
          map.palette_items.includes(species: :common_names, variety: :common_names).map do |item|
            {
              id: item.id, species_id: item.species_id, variety_id: item.variety_id, name: item.display_name,
              latin_name: item.variety&.full_latin_name || item.species.latin_name,
              strata: item.effective_strata, role: item.role, target_count: item.target_count, notes: item.notes
            }.compact
          end
        end

        def centroid(map)
          point = map.center || map.boundary&.centroid
          point && [ point.x.round(Geo::PRECISION), point.y.round(Geo::PRECISION) ]
        end

        def element_counts(map)
          counts = map.features.where.not(status: "rejected").group(:layer, :status).count
          counts = counts.reject { |(layer, _), _| layer == "networks" } unless editor?
          by_layer = counts.each_with_object({}) do |((layer, status), n), acc|
            (acc[layer] ||= { "active" => 0, "draft" => 0 })[status] = n
          end
          {
            by_layer:,
            total_active: counts.sum { |(_, status), n| status == "active" ? n : 0 },
            drafts_pending: counts.sum { |(_, status), n| status == "draft" ? n : 0 },
            # Changes an AI proposed to existing elements (never networks), waiting for review.
            updates_pending: map.feature_update_drafts.pending.count,
            hidden_layers: [ "networks" ],
            hidden_note: t(editor? ? "notes.networks_on_request" : "notes.networks_hidden")
          }
        end

        # The map's tags (shared by all its elements) and how many elements carry each.
        def tag_counts(map)
          scope = map.features.where.not(status: "rejected")
          scope = scope.where.not(layer: "networks") unless editor?
          scope.tag_counts
        end

        # The owner is trying drafts on the free plan: say until when, so
        # Claude can warn the user before the trial ends.
        def trial_note(entitlements)
          return unless entitlements.ai_trial?
          date = I18n.l(entitlements.ai_trial_ends_at.in_time_zone.to_date, format: :long)
          t("notes.drafts_trial", date:)
        end

        def summarize_result(data)
          { elements: data[:elements][:total_active], drafts: data[:elements][:drafts_pending], updates: data[:elements][:updates_pending] }
        end
    end
  end
end

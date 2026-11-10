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
          project: map.project_sheet.without_personal,
          project_percent: map.project_sheet.progress[:percent],
          project_drafts_pending: map.project_sheet_drafts.count,
          project_team_notes: project_team_notes(map),
          elements: element_counts(map),
          tags: tag_counts(map),
          variants: variants(map),
          palette: palette(map),
          palette_budget: palette_budget(map),
          palette_drafts_pending: map.palette_drafts.count,
          place: place(map),
          succession: SuccessionBalance.new(map).as_json,
          bioindicators: bioindicators(map),
          soil_samples: soil_samples(map),
          tasks: {
            pending: map.tasks.pending.count, overdue: map.tasks.overdue.count, done: map.tasks.done.count,
            mine_pending: map.tasks.pending.where(assignee: user).count
          },
          documents: map.documents.count,
          site_visits: site_visits(map),
          photos: map.photos.count,
          drone_views: drone_views(map),
          discussion: discussion(map),
          observation_year: MapFeature::SeasonSign.observation_year(map),
          first_hour: first_hour(map),
          offer: offer(map),
          time_entries: time_entries(map),
          sectors: sectors(map),
          exports: exports(map),
          presentations: presentations(map),
          publication: publication(map),
          implementation: implementation(map),
          season: season(map),
          team_season: team_season(map),
          team_project: team_project(map),
          known_kinds: I18n.t("editor.kinds", default: {}),
          layers: MapFeature::LAYERS.index_with { |layer| I18n.t("editor.layers.#{layer}", default: layer) },
          reader_guide: reader_guide,
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
        # A reader (most often the person the garden is designed for) gets the
        # help article written for them: how to read the plan, ask, print.
        def reader_guide
          return nil unless @role == "viewer"
          article = HelpArticle.find(MapInvitationMailer::READER_GUIDE) or return nil
          { slug: article.slug, title: article.title, url: "#{origin}/help/#{article.slug}", note: t("notes.reader_guide") }
        end

      # The map's drone views, newest first, and how well each one lines up
      # (« Recaler la vue », done by a person in the editor, never by the AI).
      def drone_views(map)
        map.aerial_views.ready.newest_first.map do |view|
          done = view.alignments.select { _1["status"] == "done" }
          {
            id: view.id, name: view.name, captured_on: view.captured_on.iso8601, product: view.product,
            realignable: view.alignable?,
            realigned: (done.any? ? { count: done.size, last_at: done.last["finished_at"] || done.last["at"], shift_m: done.last["shift_m"], landmarks: done.last["pairs"].size } : nil),
            realigning: view.pending_alignment.present? || nil
          }.compact
        end
      end

      # The walks made with the phone; list_site_visits gives each one.
      def site_visits(map)
        last = map.site_visits.reorder(started_at: :desc).first
        {
          count: map.site_visits.count,
          with_audio: map.site_visits.where.not(audio_document_id: nil).count,
          last_started_at: last&.started_at&.iso8601
        }.compact
      end

        MAX_BIOINDICATORS = 100

        # The team's internal notes on the sheet, for the team (or the map's
        # pro owner) only: which sections have one. The text is in
        # get_project_sheet. Nil for anyone else, who is not told they exist.
        def project_team_notes(map)
          return nil unless ProjectSheetNote.audience?(map, user)
          { sections: map.project_sheet_notes.order(:section).pluck(:section), note: t("notes.project_team_notes") }
        end

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
            shows_growth: publication.options.fetch("show_growth", true) != false,
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
        # The sector analysis: the sun at the solstices (computed from the
        # latitude) and the sectors noted around the terrain, accepted or proposed.
        # The map's live discussion at a glance (list_discussion reads it), for its members only.
        def discussion(map)
          return { member: false } unless map.chat_member?(user)
          messages = map.comments.visible
          read = CommentRead.find_by(user:, commentable: map)&.last_read_at
          unread = messages.where.not(author_id: user.id)
          unread = unread.where(created_at: read..) if read
          {
            member: true, messages: messages.count, unread: unread.count,
            pinned: messages.where.not(location: nil).count,
            last_message_at: messages.maximum(:created_at)&.iso8601
          }
        end

        def sectors(map)
          center = map.center || map.boundary&.centroid
          return nil unless center
          range = ->(from, to) { from == to ? I18n.t("sectors.all_around") : I18n.t("sectors.range", from: Sectors::Arc.compass_point(from), to: Sectors::Arc.compass_point(to)) }
          drawn = map.features.where(kind: "sector", status: %w[active draft]).order(:id).filter_map do |feature|
            from, to = Sectors::Arc.directions(feature, [ center.x, center.y ])
            next unless from
            {
              id: feature.id, status: feature.status, sector_type: feature.properties["sector_type"], group: Sectors::Arc.group(feature.properties["sector_type"]),
              season: feature.properties["sector_season"] || "all_year", from_deg: from, to_deg: to, directions: range.(from, to),
              name: feature.name, notes: feature.notes
            }.compact
          end
          sun = Sectors::Arc.sun(center.y).map { |s| s.merge(group: "sun", directions: range.(s[:from_deg], s[:to_deg])) }
          {
            sun:,
            drawn:,
            # The groups to show or hide together when presenting the design, and the
            # link that opens the map with only some of them kept around the terrain.
            groups: (sun + drawn).map { |s| s[:group] }.uniq.sort_by { |g| Sectors::Arc::GROUPS.keys.index(g) },
            panel_url: "#{map_url(map)}?panel=sectors",
            show_url: "#{map_url(map)}?sectors=all"
          }
        end

        # Where the person prints the design: the project dossier (sector
        # page included) and the PDF plan at scale, as one plan or as a book
        # of thematic sheets. The PDF is drawn in the browser: the links open
        # it ready to make.
        def exports(map)
          {
            dossier_url: "#{map_url(map)}/dossier",
            plan_pdf_url: "#{map_url(map)}?export=plan",
            book_pdf_url: "#{map_url(map)}?export=book",
            pdf_in_plan: Entitlements.for_map(map).pdf_export?
          }
        end

        # The « Présenter » sequences of the map: each step a view of the map
        # (panel, layers, sectors, moment) or a text slide, with the presenter's note. The
        # panel opens at panel_url, where the person presents full screen.
        def presentations(map)
          list = map.presentations.map do |presentation|
            {
              id: presentation.id, name: presentation.name, template: presentation.template_key,
              # Notes and drafts are the presenter's: a viewer (often the client) gets neither.
              steps: (editor? ? presentation.steps : presentation.for_viewer[:steps]).map do |step|
                view = step["view"] || {}
                { id: step["id"], title: step["title"], shown: step["shown"], view_adjusted: step["captured"], note: (step["note"] if editor?),
                  slide: step["slide"] && { text: step["slide"]["body"], format: "markdown" },
                  pending_proposal: step["proposal"]&.slice("title", "body", "new"),
                  panel: view["panel"], sectors: view["sectors"], moment: view["moment"], mode: view["mode"], variant_id: view["variantId"], in_3d: view["relief"].present? || nil, view_3d: view["relief"]&.slice("tab", "year", "night").presence }.compact
              end
            }
          end
          {
            list:,
            templates: PresentationTemplate.all.map { { key: _1.key, name: _1.name } },
            panel_url: "#{map_url(map)}?panel=present"
          }
        end

        # The project's season steps (SeasonSteps: design, work site,
        # planting) from the start of this month, forecasts (an offer not
        # signed yet) included, as the frieze of its « Tâches » page draws
        # them, with the bare-root planting window.
        def season(map)
          window = SeasonSteps.window
          {
            tasks_url: "#{map_url(map)}/tasks",
            planting_window: { opens_on: window.begin.iso8601, closes_on: window.end.iso8601 },
            steps: map.tasks.steps.where(due_on: Date.current.beginning_of_month..).order(:starts_on, :id).map do |task|
              { task_id: task.id, kind: task.step_kind, title: task.title, starts_on: task.starts_on.iso8601,
                ends_on: task.due_on.iso8601, forecast: task.forecast, done: task.done? }
            end
          }
        end

        # « Temps et dépenses », in one line per phase: hours noted against
        # the accepted offer's envelope. For the project's team only, never
        # its client; list_time_entries has the detail.
        def time_entries(map)
          return nil unless TimeEntry.usable_by?(map, user)
          envelopes = TimeEntry::Envelopes.new(map)
          {
            url: "#{map_url(map)}/time_entries", offer_version: envelopes.version_json&.dig(:label),
            hours: envelopes.totals[:hours], km: envelopes.totals[:km],
            phases: envelopes.phases.filter_map { |p| { phase: p[:key], hours: p[:hours], envelope_hours: p[:envelopeHours], over_hours: p[:overHours] }.compact if p[:hours].positive? || p[:envelopeHours] }
          }
        end

        # A team project on the team board: its stage, the team's section of
        # that column it sits in (BoardSection, such as « Pré-design ») among
        # the column's sections, on hold or not, the date promised to the
        # client and the board, whose « La saison qui vient » draws the same
        # steps as `season`. nil off a team or for its places.
        def team_season(map)
          return nil unless map.organization_id && !map.own_place
          {
            stage: map.board_phase, section: map.board_section&.name,
            stage_sections: map.organization.board_sections.where(phase: map.board_phase).ordered.pluck(:name),
            on_hold: map.on_hold?, promised_on: map.promised_on&.iso8601, board_url: "#{origin}/teams/#{map.organization_id}/board"
          }
        end

        # What the team reads about the project before opening its map (the
        # board's « Aperçu du projet »): next action and who carries it, what
        # was done lately, task lists, project manager and crew, how far the
        # offer went. For the team's members only; nil elsewhere.
        def team_project(map)
          return nil unless map.organization_id && !map.own_place && map.organization.member?(user)
          Teams::ProjectPreview.new(map, user).for_mcp
        end

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
            total_tvac: totals["total_tvac"], total_htva: (services_htva + plants_htva + co_management_htva(version.result["co_management"])).round(2),
            services_tvac: totals["services_price_tvac"], services_htva: services_htva.round(2),
            plants_supplies_tvac: totals["plants_supplies_base_tvac"], plants_supplies_htva: plants_htva.round(2),
            design_tvac: totals["design_tvac"], implementation_tvac: totals["implementation_tvac"],
            hours_min: phases.sum { _1["hours_min"].to_f }.round(1), hours_max: phases.sum { _1["hours_max"].to_f }.round(1),
            # A phase the team left out of the offer (enabled: false) counts nowhere.
            phases: phases.map { { key: _1["key"], enabled: _1.fetch("enabled", true), price_tvac: _1["price_tvac"], hours_min: _1["hours_min"], hours_max: _1["hours_max"] } },
            co_management: co_management_budget(version.result["co_management"])
          }
        end

        def co_management_htva(spec) = spec.is_a?(Hash) && spec["enabled"] ? spec["amount_htva"].to_f : 0

        # Co-management after planting, when the offer includes it: half-days
        # and price year by year. Older versions only estimated it.
        def co_management_budget(spec)
          return nil unless spec.is_a?(Hash) && spec["enabled"]
          { total_tvac: spec["amount_tvac"], years: Array(spec["years"]).map { _1.slice("year", "half_days", "hours", "amount_tvac") } }
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

        # How many sampling points, how many carry lab reports or photos, and how many
        # wait for the review of values an AI read (get_soil_samples).
        def soil_samples(map)
          samples = map.soil_samples.with_attached_lab_reports.to_a
          with_photos = map.photos.where(soil_sample_id: samples.map(&:id)).distinct.count(:soil_sample_id)
          {
            total: samples.size, analysed: samples.count(&:analysed?), with_photos:,
            with_reports: samples.count { |s| s.lab_reports.attached? },
            drafts_pending: samples.count { |s| s.draft.pending? }
          }
        end

        # « Ta première heure »: what Terranova reads of the place on its own
        # (Maps::PlaceReading: slope in %, which way it runs, drop in metres,
        # where rain water gathers), when the person first read it, and the
        # three things to go and see outside (Maps::FirstHourMissions).
        def first_hour(map)
          missions = Maps::FirstHourMissions.new(map)
          {
            started_at: map.first_hour_started_at&.iso8601,
            reading: Maps::PlaceReading.new(map).call.presence,
            missions: missions.missions,
            missions_done: missions.done?,
            signs_this_month: missions.as_json[:signs]
          }.compact
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

        # The species chosen for this terrain (accepted entries only), with
        # what the « Palette végétale » table counts for each: plants planned
        # on the map, in the ground, still to plant, the price noted, and a
        # flag when it is invasive in the country or toxic for the animals.
        def palette(map)
          rows = palette_rows(map).index_by { _1[:paletteItemId] }
          map.palette_items.includes(species: :common_names, variety: :common_names).map do |item|
            row = rows[item.id] || {}
            planned, planted = row[:planned].to_i, row[:planted].to_i
            {
              id: item.id, species_id: item.species_id, variety_id: item.variety_id, name: item.display_name,
              latin_name: item.variety&.full_latin_name || item.species.latin_name,
              strata: item.effective_strata, role: item.role, target_count: item.target_count, notes: item.notes,
              planned:, planted:, to_plant: [ planned - planted, 0 ].max,
              unit_price_eur: item.unit_price&.to_f, supplier: item.supplier, size: item.size,
              excluded_by: row[:excludedBy].presence
            }.compact
          end
        end

        # What the plants with a price cost: what is left to buy (not yet in
        # the ground) and the whole, as the palette page header shows them
        # (plants drawn on the map, else the palette's target).
        def palette_budget(map)
          priced = palette_rows(map).select { _1[:unitPrice] }
          return nil if priced.empty?
          {
            to_buy_eur: priced.sum { _1[:unitPrice] * PlantPalette.to_buy_quantity(_1) }.round(2),
            total_eur: priced.sum { _1[:unitPrice] * PlantPalette.budget_quantity(_1) }.round(2)
          }
        end

        def palette_rows(map) = @palette_rows ||= PlantPalette.new(map).rows

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

        # The project variants (« Projet 1 », « Projet 2 »): each keeps its
        # own elements, the common project is in all; the retained one is
        # what the palette, the offer, the implementation plan and the 3D count.
        def variants(map)
          own = map.features.where.not(status: "rejected").where.not(variant_id: nil).group(:variant_id).count
          {
            list: map.variants.map { |v| v.as_json.merge(own_elements: own[v.id].to_i) },
            note: t(map.variants.any? ? "notes.variants" : "notes.no_variants"),
            panel_url: "#{map_url(map)}?panel=variants"
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

module Mcp
  module Tools
    # What the soil tools share: a soil sample and its lab reports as the AI
    # reads them, and the typed fields its results go in.
    module SoilHelpers
      private
        def find_sample!(map, id)
          map.soil_samples.with_attached_lab_reports.with_photos.find_by(id:) or raise ToolError, t("errors.soil_sample_not_found", id:)
        end

        def sample_json(sample)
          {
            id: sample.id, label: sample.label, status: sample.status,
            depth_cm: [ sample.depth_from_cm, sample.depth_to_cm ],
            sampled_on: sample.sampled_on&.iso8601, lab: sample.lab, lab_reference: sample.lab_reference,
            location: sample.location && [ sample.lng.round(Geo::PRECISION), sample.lat.round(Geo::PRECISION) ],
            results: sample.results.presence, other_results: sample.other_results.presence, notes: sample.notes,
            reports: sample.lab_reports.map { |report| { report_id: report.id, filename: report.filename.to_s, byte_size: report.byte_size } },
            # The photos of the point (hole, core, profile), to look at with get_photo.
            photos: sample.photos.map { |photo| { photo_id: photo.id, caption: photo.caption, taken_at: photo.taken_at&.iso8601, kind: photo.kind }.compact },
            draft_pending: sample.draft.pending? || nil
          }.compact
        end

        # The typed result fields: key, name the person reads, unit and range.
        def soil_fields
          SoilSample::RESULT_FIELDS.map do |key, spec|
            { key:, name: I18n.t("soil.fields.#{key}.name"), unit: spec[:unit], min: spec[:range].min, max: spec[:range].max }.compact
          end
        end

        def soil_url(map) = map_url(map)
    end
  end
end

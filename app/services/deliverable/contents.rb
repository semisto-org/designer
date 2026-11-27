module Deliverable
  # What a map's client deliverable (« Livrable client ») shows beside the
  # plan: the documents, photos, videos and soil analyses its team marked
  # `in_deliverable`, read live. File addresses go through the deliverable's
  # own routes (DeliverablesController), which check the token and the mark
  # again before handing out a short-lived storage link.
  #
  # Nothing here comes from people: no uploader names, no original photo
  # file (its EXIF block), no discussion file outside the library.
  #
  # Nothing goes without its own mark: a soil point carries its figures, its
  # reading and its lab reports, never its notes, and only those of its
  # photos that are marked themselves. A photo of a point can be an order
  # form, a price list or a face: the team chooses it, one by one.
  class Contents
    include Rails.application.routes.url_helpers

    def initialize(map, token: nil)
      @map = map
      @token = token
    end

    def documents = @map.all_documents.in_deliverable
    # Every marked photo and video, those of soil points included: what the counts say.
    def photos = @map.photos.in_deliverable
    # A sampling point shows once it has been taken; a planned one has nothing to say yet.
    def soil_samples = @map.soil_samples.in_deliverable.where(status: "sampled")

    def counts
      { documents: documents.count, photos: photos.images.count, videos: photos.videos.count, soilSamples: soil_samples.count }
    end

    def as_json(*)
      { documents: documents_json, photos: photos_json, soilSamples: soil_json }
    end

    private
      def documents_json
        documents.newest_first.includes(:form_response, file_attachment: :blob, thumbnail_attachment: :blob).map do |document|
          blob = document.file.attached? ? document.file.blob : nil
          url = ->(size) { deliverable_document_path(@token, document, size:) }
          {
            id: document.id, title: document.title, description: document.description, tags: document.tags,
            kind: document.kind, preview: document.preview, filename: blob&.filename&.to_s, byteSize: blob&.byte_size,
            createdAt: document.created_at.iso8601,
            thumbUrl: document.thumb_available? ? url.call("thumb") : nil,
            previewUrl: document.preview ? url.call(document.preview == "image" ? "large" : "original") : nil,
            downloadUrl: url.call("download")
          }
        end
      end

      # The gallery: marked photos not already shown under a soil point of the deliverable.
      def photos_json
        shown_with_soil = soil_samples.ids
        gallery = shown_with_soil.empty? ? photos : photos.where(soil_sample_id: nil).or(photos.where.not(soil_sample_id: shown_with_soil))
        gallery.chronological.includes(image_attachment: :blob).map { |photo| photo_json(photo) }
      end

      def photo_json(photo)
        blob = photo.image.attached? ? photo.image.blob : nil
        url = ->(size) { deliverable_photo_path(@token, photo, size:) }
        {
          id: photo.id, kind: photo.kind, caption: photo.caption, takenAt: photo.taken_at&.iso8601,
          lng: photo.lng, lat: photo.lat, heading: photo.heading,
          width: blob&.metadata&.dig("width"), height: blob&.metadata&.dig("height"),
          durationS: blob&.metadata&.dig("duration")&.to_f&.round,
          thumbUrl: url.call("thumb"), largeUrl: url.call("large"),
          videoUrl: photo.video? ? url.call("video") : nil
        }
      end

      def soil_json
        analyses = Entitlements.for_map(@map).analyses?
        soil_samples.ordered.includes(photos: { image_attachment: :blob }, lab_reports_attachments: :blob).map do |sample|
          {
            id: sample.id, label: sample.label, lng: sample.lng, lat: sample.lat,
            depthFromCm: sample.depth_from_cm, depthToCm: sample.depth_to_cm,
            sampledOn: sample.sampled_on&.iso8601, lab: sample.lab,
            results: sample.results.slice(*SoilSample::RESULT_KEYS), otherResults: sample.other_results,
            interpretation: analyses && sample.analysed? ? SoilAnalysis::Interpretation.for(sample) : nil,
            reports: sample.lab_reports.map do |report|
              { filename: report.filename.to_s, byteSize: report.byte_size, url: deliverable_soil_report_path(@token, sample, report_id: report.id) }
            end,
            # The hole, the core, the profile: only those the team marked themselves.
            photos: sample.photos.select(&:in_deliverable?).map { |photo| photo_json(photo) }
          }
        end
      end
  end
end

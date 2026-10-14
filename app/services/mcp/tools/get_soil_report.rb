module Mcp
  module Tools
    # One lab report (PDF) of a soil sample, as text (in slices of
    # MAX_CHARS characters). A scan has no text: its pages come as images,
    # MAX_SCAN_PAGES at a time, for the AI to read.
    class GetSoilReport < Base
      include SoilHelpers

      MAX_CHARS = 40_000
      MAX_SCAN_PAGES = 4
      ReportSource = Struct.new(:id, :file, :extension, :kind)

      arguments(
        properties: {
          map_id: { type: "integer", minimum: 1, description: :map_id },
          sample_id: { type: "integer", minimum: 1, description: :soil_sample_id },
          report_id: { type: "integer", minimum: 1, description: :soil_report_id },
          offset: { type: "integer", minimum: 0, default: 0, description: :offset },
          first_page: { type: "integer", minimum: 1, default: 1, description: :first_page }
        },
        required: %w[map_id sample_id report_id]
      )
      hints

      def perform(map_id:, sample_id:, report_id:, offset: 0, first_page: 1)
        map = find_map!(map_id)
        sample = find_sample!(map, sample_id)
        report = sample.lab_reports.find { |r| r.id == report_id } or raise ToolError, t("errors.soil_report_not_found", id: report_id)
        read = DocumentReader.new(ReportSource.new(report.id, report, "pdf", "pdf")).call
        data = { sample: sample_json(sample), report_id: report.id, filename: report.filename.to_s, format: read.format }
        case read.format
        when "text"
          text = read.text
          slice = text[offset, MAX_CHARS].to_s
          after = offset + slice.size
          data.merge(
            pages: read.pages, total_chars: text.size, offset:, text: slice,
            next_offset: after < text.size ? after : nil, result_fields: soil_fields, units_note: t("notes.soil_units"),
            next_step: t("notes.propose_soil_results")
          ).compact
        when "unreadable"
          read.reason == "scanned" ? scanned(report, data, first_page) : data.merge(format: "unreadable", reason: t("document_unreadable.#{read.reason}"))
        end
      end

      private
        # Page images of a scan, when the server can draw them.
        def scanned(report, data, first_page)
          total = report.blob.open { |file| PDF::Reader.new(file.path).page_count }
          @images = first_page <= total ? report.blob.open { |file| PdfPages.new.render(file.path, first: first_page, count: MAX_SCAN_PAGES) } : []
          return data.merge(format: "unreadable", reason: t("document_unreadable.scanned")) if @images.empty?
          after = first_page + @images.size
          data.merge(
            format: "images", pages: total, first_page:, images: @images.size,
            next_first_page: after <= total ? after : nil, result_fields: soil_fields, units_note: t("notes.soil_units"),
            next_step: t("notes.propose_soil_results")
          ).compact
        rescue PDF::Reader::MalformedPDFError, PDF::Reader::EncryptedPDFError
          data.merge(format: "unreadable", reason: t("document_unreadable.scanned"))
        end

        def content_for(data)
          super + Array(@images).map { |bytes| { type: "image", data: Base64.strict_encode64(bytes), mimeType: "image/jpeg" } }
        end

        def summarize_result(data) = { sample_id: data.dig(:sample, :id), report_id: data[:report_id], format: data[:format] }
    end
  end
end

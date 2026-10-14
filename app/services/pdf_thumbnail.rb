# Draws the first page of a PDF as a small JPEG (at most SIZE pixels on its
# longer side, white background), like the browser does with pdf.js when a
# person uploads one. Ghostscript renders the page, libvips scales it down.
#
#   PdfThumbnail.new.render(path) # => path of a JPEG, or nil
#
# Returns nil when Ghostscript is missing, fails (a protected or broken
# PDF), or runs out of time: the document simply has no thumbnail.
class PdfThumbnail
  SIZE = 480
  TIMEOUT = 2.minutes
  # Enough pixels for a sharp 480 px thumbnail of an A4 page, without
  # drawing an A0 plan at full size.
  RESOLUTION = 96

  def render(input, output: "#{input}.thumbnail.jpg")
    page = "#{input}.page.png"
    succeeded = Ghostscript.run(
      "-sDEVICE=png16m", "-r#{RESOLUTION}", "-dFirstPage=1", "-dLastPage=1",
      "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", "-dUseCropBox",
      "-sOutputFile=#{page}", input.to_s,
      timeout: TIMEOUT, tag: "pdf_thumbnail"
    )
    return nil unless succeeded && File.size?(page)
    ImageProcessing::Vips.source(page).resize_to_limit(SIZE, SIZE)
      .convert("jpeg").saver(strip: true, quality: 80).call(destination: output)
    output
  rescue Vips::Error => error
    Rails.logger.warn("[pdf_thumbnail] #{error.message}")
    nil
  ensure
    File.delete(page) if page && File.exist?(page)
  end
end

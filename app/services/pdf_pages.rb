# Draws pages of a PDF as JPEGs an AI can look at (at most MAX_SIDE pixels
# on their longer side), for a scanned report that has no text layer.
# Ghostscript renders the pages, libvips scales them down.
#
#   PdfPages.new.render(path, first: 1, count: 4) # => [jpeg bytes, …] (empty on failure)
class PdfPages
  MAX_SIDE = 1568
  RESOLUTION = 150
  TIMEOUT = 2.minutes

  def render(input, first: 1, count: 4)
    last = first + count - 1
    pattern = "#{input}.page-%03d.png"
    succeeded = Ghostscript.run(
      "-sDEVICE=png16m", "-r#{RESOLUTION}", "-dFirstPage=#{first}", "-dLastPage=#{last}",
      "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4", "-dUseCropBox",
      "-sOutputFile=#{pattern}", input.to_s,
      timeout: TIMEOUT, tag: "pdf_pages"
    )
    return [] unless succeeded
    pages(input).map do |page|
      ImageProcessing::Vips.source(page).resize_to_limit(MAX_SIDE, MAX_SIDE)
        .convert("jpeg").saver(strip: true, quality: 82).call.then { |file| File.binread(file.path).tap { file.close! } }
    end
  rescue Vips::Error => error
    Rails.logger.warn("[pdf_pages] #{error.message}")
    []
  ensure
    pages(input).each { |page| File.delete(page) }
  end

  private
    def pages(input) = Dir.glob("#{input}.page-*.png").sort
end

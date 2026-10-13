# Shrinks a PDF with Ghostscript, keeping it close to the original: images
# are resampled to 300 dpi and recompressed, fonts subset, duplicates merged
# (the « printer » preset, like iLovePDF's « Less compression »). Text and
# vectors stay vectors.
#
#   PdfCompressor.new.compress(path) # => path of a smaller PDF, or nil
#
# Returns nil when Ghostscript is missing, fails, runs out of time, or when
# the result is not clearly smaller: the caller keeps the original then.
class PdfCompressor
  TIMEOUT = 10.minutes
  # Below this gain, keeping the original is not worth a second encoding.
  MIN_GAIN = 0.1

  def self.available? = Ghostscript.available?

  def compress(input, output: "#{input}.compressed.pdf")
    succeeded = Ghostscript.run(
      "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7", "-dPDFSETTINGS=/printer",
      "-dDetectDuplicateImages=true", "-dSubsetFonts=true", "-dCompressFonts=true",
      "-sOutputFile=#{output}", input.to_s,
      timeout: TIMEOUT, tag: "pdf_compressor"
    )
    return nil unless succeeded
    return nil unless File.exist?(output) && File.binread(output, 5) == "%PDF-"
    File.size(output) <= File.size(input) * (1 - MIN_GAIN) ? output : nil
  end
end

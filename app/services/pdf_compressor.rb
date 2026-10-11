require "open3"

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

  def self.available? = binary.present?

  def self.binary
    return @binary if defined?(@binary)
    @binary = ENV.fetch("PATH", "").split(File::PATH_SEPARATOR).map { |dir| File.join(dir, "gs") }.find { |path| File.executable?(path) }
  end

  def compress(input, output: "#{input}.compressed.pdf")
    return nil unless self.class.available?
    command = [
      self.class.binary, "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE",
      "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.7", "-dPDFSETTINGS=/printer",
      "-dDetectDuplicateImages=true", "-dSubsetFonts=true", "-dCompressFonts=true",
      "-sOutputFile=#{output}", input.to_s
    ]
    return nil unless run(command)
    return nil unless File.exist?(output) && File.binread(output, 5) == "%PDF-"
    File.size(output) <= File.size(input) * (1 - MIN_GAIN) ? output : nil
  end

  private
    def run(command)
      Open3.popen2e(*command) do |stdin, out, wait|
        stdin.close
        reader = Thread.new { out.read }
        unless wait.join(TIMEOUT.to_i)
          Process.kill("KILL", wait.pid) rescue nil
          wait.join
          Rails.logger.warn("[pdf_compressor] timed out after #{TIMEOUT.inspect}")
          return false
        end
        log = reader.value
        Rails.logger.warn("[pdf_compressor] gs failed: #{log.to_s.last(500)}") unless wait.value.success?
        wait.value.success?
      end
    rescue SystemCallError => error
      Rails.logger.warn("[pdf_compressor] #{error.message}")
      false
    end
end

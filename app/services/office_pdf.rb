require "open3"

# Turns a word-processor file (.docx, .doc, .odt, .rtf) into a PDF with
# LibreOffice, run headless for that one file and gone right after: about
# 200 Mo while it works (a 30-page .docx takes two seconds), nothing between
# conversions. ConvertMapDocumentToPdfJob runs one conversion at a time.
# Installed in the Docker image; without it, `available?` is false and the
# library does not offer the conversion.
class OfficePdf
  EXTENSIONS = %w[docx doc odt rtf].freeze
  TIMEOUT = 120.seconds

  def self.available? = binary.present?

  def self.binary
    return @binary if defined?(@binary)
    @binary = ENV.fetch("PATH", "").split(File::PATH_SEPARATOR)
      .flat_map { |dir| %w[soffice libreoffice].map { |name| File.join(dir, name) } }
      .find { |path| File.executable?(path) }
  end

  def self.convertible?(extension) = EXTENSIONS.include?(extension.to_s.downcase)

  # Converts the file at `source` (named with its extension) and returns the
  # path of the PDF, in a fresh directory the caller removes with
  # `cleanup`; nil when LibreOffice is missing, fails or takes too long.
  def convert(source, timeout: TIMEOUT)
    return nil unless self.class.available?
    @dir = Dir.mktmpdir("office-pdf")
    # Its own profile, so that two conversions never share (and lock) one.
    profile = "-env:UserInstallation=file://#{File.join(@dir, "profile")}"
    command = [ self.class.binary, profile, "--headless", "--norestore", "--nolockcheck", "--convert-to", "pdf", "--outdir", File.join(@dir, "out"), source ]
    return nil unless run(command, timeout)
    output = File.join(@dir, "out", "#{File.basename(source, ".*")}.pdf")
    File.size?(output) ? output : nil
  end

  def cleanup
    FileUtils.rm_rf(@dir) if @dir
  end

  private
    def run(command, timeout)
      Open3.popen2e(*command, pgroup: true) do |stdin, out, wait|
        stdin.close
        reader = Thread.new { out.read }
        unless wait.join(timeout.to_i)
          # LibreOffice starts a child of its own: the whole group goes.
          Process.kill("KILL", -wait.pid) rescue nil
          wait.join
          Rails.logger.warn("[office_pdf] timed out after #{timeout.inspect}")
          return false
        end
        log = reader.value
        Rails.logger.warn("[office_pdf] soffice failed: #{log.to_s.last(500)}") unless wait.value.success?
        wait.value.success?
      end
    rescue SystemCallError => error
      Rails.logger.warn("[office_pdf] #{error.message}")
      false
    end
end

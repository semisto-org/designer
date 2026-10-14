require "open3"

# Runs Ghostscript (`gs`), the server's only PDF engine: PdfCompressor
# shrinks PDFs with it, PdfThumbnail draws their first page. Installed in the
# Docker image and in CI; without it, both callers fall back gracefully.
module Ghostscript
  def self.available? = binary.present?

  def self.binary
    return @binary if defined?(@binary)
    @binary = ENV.fetch("PATH", "").split(File::PATH_SEPARATOR).map { |dir| File.join(dir, "gs") }.find { |path| File.executable?(path) }
  end

  # Runs gs with these arguments (after the safe defaults). True when it
  # succeeds in time; logs and returns false otherwise.
  def self.run(*arguments, timeout:, tag:)
    return false unless available?
    command = [ binary, "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", *arguments ]
    Open3.popen2e(*command) do |stdin, out, wait|
      stdin.close
      reader = Thread.new { out.read }
      unless wait.join(timeout.to_i)
        Process.kill("KILL", wait.pid) rescue nil
        wait.join
        Rails.logger.warn("[#{tag}] timed out after #{timeout.inspect}")
        return false
      end
      log = reader.value
      Rails.logger.warn("[#{tag}] gs failed: #{log.to_s.last(500)}") unless wait.value.success?
      wait.value.success?
    end
  rescue SystemCallError => error
    Rails.logger.warn("[#{tag}] #{error.message}")
    false
  end
end

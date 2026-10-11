require "test_helper"
require_relative "../test_helpers/pdf_test_helper"

class PdfCompressorTest < ActiveSupport::TestCase
  include PdfTestHelper

  setup { @dir = Dir.mktmpdir }
  teardown { FileUtils.rm_rf(@dir) }

  def write(name, bytes)
    File.join(@dir, name).tap { |path| File.binwrite(path, bytes) }
  end

  test "Ghostscript is installed where the tests run" do
    assert PdfCompressor.available?, "install ghostscript (apt-get install ghostscript)"
  end

  test "shrinks a PDF heavy with raw images, into a valid PDF" do
    input = write("plan.pdf", heavy_pdf)
    output = PdfCompressor.new.compress(input)
    assert output
    assert_equal "%PDF-", File.binread(output, 5)
    assert_operator File.size(output), :<, File.size(input) / 4
  end

  test "keeps nothing when the PDF is already lean" do
    input = write("rapport.pdf", file_fixture("rapport_labo.pdf").binread)
    assert_nil PdfCompressor.new.compress(input)
  end

  test "a broken file is not compressed" do
    assert_nil PdfCompressor.new.compress(write("casse.pdf", "%PDF-1.4 pas vraiment un PDF"))
  end

  test "without Ghostscript, nothing happens" do
    without_ghostscript do
      assert_nil PdfCompressor.new.compress(write("plan.pdf", heavy_pdf(side: 100)))
    end
  end
end

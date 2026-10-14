require "test_helper"
require_relative "../test_helpers/pdf_test_helper"

class PdfThumbnailTest < ActiveSupport::TestCase
  include PdfTestHelper

  setup { @dir = Dir.mktmpdir }
  teardown { FileUtils.rm_rf(@dir) }

  def write(name, bytes)
    File.join(@dir, name).tap { |path| File.binwrite(path, bytes) }
  end

  test "draws the first page as a JPEG of at most 480 pixels" do
    output = PdfThumbnail.new.render(write("plan.pdf", heavy_pdf(side: 1200)))
    assert output
    image = Vips::Image.new_from_file(output)
    assert_equal [ 480, 480 ], [ image.width, image.height ]
    assert_equal "image/jpeg", Marcel::MimeType.for(Pathname(output))
    assert_empty Dir.glob(File.join(@dir, "*.png")), "the full-size page is cleaned up"
  end

  test "a broken PDF or no Ghostscript gives no thumbnail" do
    assert_nil PdfThumbnail.new.render(write("casse.pdf", "%PDF-1.4 pas vraiment un PDF"))
    without_ghostscript do
      assert_nil PdfThumbnail.new.render(write("plan.pdf", heavy_pdf(side: 100)))
    end
  end
end

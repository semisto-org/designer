require "test_helper"
require_relative "../test_helpers/office_pdf_test_helper"

class OfficePdfTest < ActiveSupport::TestCase
  include OfficePdfTestHelper

  setup { @converter = OfficePdf.new }
  teardown { @converter.cleanup }

  test "LibreOffice turns a .docx into a PDF that keeps its text" do
    skip "LibreOffice is not installed here" unless OfficePdf.available?
    output = @converter.convert(file_fixture("plan_de_plantation.docx").to_s)
    assert output
    assert_equal "application/pdf", Marcel::MimeType.for(Pathname(output))
    assert_includes PDF::Reader.new(output).pages.map(&:text).join, "Pommier"
  end

  test "only word-processor files are offered" do
    assert OfficePdf.convertible?("docx")
    assert OfficePdf.convertible?("ODT")
    refute OfficePdf.convertible?("xlsx")
    refute OfficePdf.convertible?(nil)
  end

  test "no LibreOffice, a failure or a conversion that hangs gives no PDF, and leaves nothing behind" do
    source = file_fixture("plan_de_plantation.docx").to_s
    without_libreoffice { assert_nil @converter.convert(source) }
    with_fake_libreoffice("fail") { assert_nil @converter.convert(source) }
    with_fake_libreoffice("hang") { assert_nil @converter.convert(source, timeout: 1) }
    dir = @converter.instance_variable_get(:@dir)
    @converter.cleanup
    refute Dir.exist?(dir)
  end
end

require "test_helper"
require_relative "../test_helpers/office_pdf_test_helper"
require_relative "../test_helpers/billing_test_helper"

class ConvertMapDocumentToPdfJobTest < ActiveJob::TestCase
  include OfficePdfTestHelper
  include BillingTestHelper

  setup { @map = maps(:ahinvaux) }

  test "the PDF joins the library beside its source, with its title, note and tags" do
    with_fake_libreoffice do
      source = attach_docx(@map, title: "Plan de plantation", description: "Version de mars", tags: [ "Plans" ])
      assert source.request_pdf!(by: users(:alice))
      assert_equal "pending", source.reload.pdf_conversion
      assert_difference -> { @map.documents.count }, 1 do
        perform_enqueued_jobs(only: ConvertMapDocumentToPdfJob)
      end
      copy = source.reload.pdf_copy
      assert_nil source.pdf_conversion
      assert_equal [ "Plan de plantation", "Version de mars", [ "Plans" ] ], [ copy.title, copy.description, copy.tags ]
      assert_equal "plan_de_plantation.pdf", copy.file.filename.to_s
      assert_equal "pdf", copy.preview
      assert_equal users(:alice), copy.uploaded_by
      assert_equal source, copy.converted_from
      refute copy.convertible_to_pdf?
    end
  end

  test "a file still in the discussion gets its PDF there too" do
    with_fake_libreoffice do
      source = attach_docx(@map, origin: "chat", in_library: false)
      source.request_pdf!(by: users(:michael))
      perform_enqueued_jobs(only: ConvertMapDocumentToPdfJob)
      copy = source.reload.pdf_copy
      refute copy.in_library?
      assert_equal "chat", copy.origin
    end
  end

  test "a failed conversion says so on the source, and it may be asked again" do
    with_fake_libreoffice("fail") do
      source = attach_docx(@map)
      source.request_pdf!(by: users(:michael))
      assert_no_difference -> { MapDocument.count } do
        perform_enqueued_jobs(only: ConvertMapDocumentToPdfJob)
      end
      assert_equal "failed", source.reload.pdf_conversion
      assert source.request_pdf!(by: users(:michael))
    end
  end

  test "a PDF beyond the plan's room is not made, and the source says why" do
    with_fake_libreoffice do
      source = attach_docx(@map)
      with_billing do
        # The free plan's gigabyte is all taken.
        attach_docx(@map).file.blob.update_column(:byte_size, 1.gigabyte)
        source.request_pdf!(by: users(:michael))
        perform_enqueued_jobs(only: ConvertMapDocumentToPdfJob)
      end
      assert_equal "storage_full", source.reload.pdf_conversion
      assert_nil source.pdf_copy
    end
  end

  test "one conversion at a time per document; a lost one may be asked again after a while" do
    with_fake_libreoffice do
      source = attach_docx(@map)
      assert source.request_pdf!(by: users(:michael))
      refute source.request_pdf!(by: users(:michael))
      assert_enqueued_jobs 1, only: ConvertMapDocumentToPdfJob
      travel MapDocument::PDF_CONVERSION_STALE_AFTER + 1.minute do
        assert_equal "failed", source.reload.pdf_conversion_state
        assert source.request_pdf!(by: users(:michael))
      end
    end
  end

  test "without LibreOffice, nothing is offered" do
    without_libreoffice do
      source = attach_docx(@map)
      refute source.convertible_to_pdf?
      refute source.request_pdf!(by: users(:michael))
      assert_no_enqueued_jobs only: ConvertMapDocumentToPdfJob
    end
  end

  test "with real LibreOffice, the .docx becomes a readable PDF" do
    skip "LibreOffice is not installed here" unless OfficePdf.available?
    source = attach_docx(@map)
    source.request_pdf!(by: users(:michael))
    perform_enqueued_jobs(only: ConvertMapDocumentToPdfJob)
    copy = source.reload.pdf_copy
    assert_includes PDF::Reader.new(StringIO.new(copy.file.download)).pages.map(&:text).join, "Pommier"
  end
end

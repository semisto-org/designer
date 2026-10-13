require "test_helper"
require_relative "../test_helpers/pdf_test_helper"

class MapDocumentTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper
  include PdfTestHelper

  setup { @map = maps(:ahinvaux) }

  def build(file = "rapport_labo.pdf", type = "application/pdf", **attrs)
    doc = @map.documents.new(uploaded_by: users(:michael), **attrs)
    doc.file.attach(io: file_fixture(file).open, filename: attrs.delete(:filename) || file, content_type: type)
    doc
  end

  test "takes its title from the file name and knows a PDF" do
    doc = build
    assert doc.save, doc.errors.full_messages.to_sentence
    assert_equal "rapport labo", doc.title
    assert_equal "pdf", doc.kind
    assert_equal "pdf", doc.preview
    assert_equal "library", doc.origin
  end

  test "an image is previewed through its variants" do
    doc = build("terrain.jpg", "image/jpeg")
    assert doc.save
    assert_equal "image", doc.kind
    assert_equal "image", doc.preview
    assert doc.thumb_available?
  end

  test "a text file is a document without preview" do
    doc = build("notes.txt", "text/plain")
    assert doc.save
    assert_equal "text", doc.kind
    assert_nil doc.preview
    target, disposition = doc.served("original")
    assert_equal doc.file, target
    assert_equal :attachment, disposition
    assert_equal [ nil, :inline ], doc.served("thumb")
  end

  test "refuses programs, web pages and oversized files" do
    doc = @map.documents.new
    doc.file.attach(io: StringIO.new("<script>"), filename: "page.html", content_type: "text/html")
    refute doc.valid?
    assert_match "page.html", doc.errors.full_messages.to_sentence

    big = build
    big.file.blob.byte_size = MapDocument::MAX_BYTES + 1
    refute big.valid?
    assert_match "200 Mo", big.errors.full_messages.to_sentence
  end

  test "requires a file" do
    refute @map.documents.new(title: "Vide").valid?
  end

  test "tags are free and deduplicated, like the elements' tags" do
    doc = build(tags: [ " Plans ", "plans", "Analyses  de sol" ])
    doc.save!
    assert_equal [ "Plans", "Analyses de sol" ], doc.tags
    assert_equal [ doc ], @map.documents.tagged("PLANS").to_a
    assert_equal({ "Analyses de sol" => 1, "Plans" => 1 }, @map.documents.tag_counts)
  end

  test "a PDF's thumbnail must be a small image" do
    doc = build
    doc.thumbnail.attach(io: file_fixture("terrain.jpg").open, filename: "apercu.jpg", content_type: "image/jpeg")
    assert doc.valid?
    doc.thumbnail.attach(io: StringIO.new("x"), filename: "apercu.txt", content_type: "text/plain")
    refute doc.valid?
  end

  test "a private link from another map is refused" do
    other = Map.create!(name: "Ailleurs", owner: users(:bob), region: regions(:wallonia))
    doc = build(project_sheet_link: other.create_project_sheet_link!)
    refute doc.valid?
  end

  test "goes away with its map" do
    build.save!
    assert_difference -> { MapDocument.count }, -1 do
      @map.destroy
    end
  end

  def heavy_document(**attrs)
    doc = @map.documents.new(uploaded_by: users(:michael), **attrs)
    doc.file.attach(io: StringIO.new(heavy_pdf), filename: "plan_archi.pdf", content_type: "application/pdf")
    doc
  end

  def with_threshold(bytes)
    before = MapDocument.compress_pdf_above
    MapDocument.compress_pdf_above = bytes
    yield
  ensure
    MapDocument.compress_pdf_above = before
  end

  test "a PDF over the threshold is compressed in the background" do
    with_threshold(1.megabyte) do
      doc = heavy_document
      assert_enqueued_with(job: CompressMapDocumentJob) { doc.save! }
      assert_equal "pending", doc.compression
      assert_equal "pending", doc.as_inertia(url: ->(*) { "/x" })[:compression]
    end
  end

  test "a light PDF or another file is not compressed" do
    assert_no_enqueued_jobs(only: CompressMapDocumentJob) do
      build.save!
      build("terrain.jpg", "image/jpeg").save!
    end
    assert_nil @map.documents.last.compression
  end

  test "the job keeps the lighter copy and remembers the size as sent" do
    with_threshold(1.megabyte) do
      doc = heavy_document
      perform_enqueued_jobs(only: CompressMapDocumentJob) { doc.save! }
      doc.reload
      assert_equal "compressed", doc.compression
      assert_equal heavy_pdf.bytesize, doc.original_byte_size
      assert_operator doc.file.blob.byte_size, :<, doc.original_byte_size / 4
      assert_equal "plan_archi.pdf", doc.file.filename.to_s
      assert_equal "application/pdf", doc.file.content_type
    end
  end

  test "without a gain or without Ghostscript, the original stays" do
    with_threshold(1.megabyte) do
      without_ghostscript do
        doc = heavy_document
        perform_enqueued_jobs(only: CompressMapDocumentJob) { doc.save! }
        doc.reload
        assert_equal "unchanged", doc.compression
        assert_nil doc.original_byte_size
        assert_equal heavy_pdf.bytesize, doc.file.blob.byte_size
      end
    end
  end

  test "a PDF sent without a thumbnail gets one from the server" do
    doc = build
    assert_enqueued_with(job: MapDocumentThumbnailJob) { doc.save! }
    perform_enqueued_jobs(only: MapDocumentThumbnailJob)
    doc.reload
    assert doc.thumbnail.attached?
    assert_equal "image/jpeg", doc.thumbnail.content_type
    assert doc.thumbnail_tried_at
    assert doc.as_inertia(url: ->(*) { "/x" })[:thumbUrl]
  end

  test "a PDF whose browser drew the thumbnail, or another file, is left alone" do
    assert_no_enqueued_jobs(only: MapDocumentThumbnailJob) do
      doc = build
      doc.thumbnail.attach(io: file_fixture("terrain.jpg").open, filename: "apercu.jpg", content_type: "image/jpeg")
      doc.save!
      build("terrain.jpg", "image/jpeg").save!
    end
  end

  test "the backfill draws the missing thumbnails and tries an unreadable PDF once" do
    good = build.tap { _1.save! }
    broken = @map.documents.new(uploaded_by: users(:michael))
    broken.file.attach(io: StringIO.new("%PDF-1.4 pas vraiment un PDF"), filename: "casse.pdf", content_type: "application/pdf")
    broken.save!
    assert_equal [ good, broken ].sort_by(&:id), MapDocumentThumbnailJob.pending.order(:id).to_a

    MapDocumentThumbnailJob.backfill
    assert good.reload.thumbnail.attached?
    assert_not broken.reload.thumbnail.attached?
    assert broken.thumbnail_tried_at
    assert_empty MapDocumentThumbnailJob.pending
  end
end

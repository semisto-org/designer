require "test_helper"

class MapDocumentTest < ActiveSupport::TestCase
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
    assert_match "50 Mo", big.errors.full_messages.to_sentence
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
end

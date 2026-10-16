require "test_helper"

class MapDocumentMarkdownTest < ActiveSupport::TestCase
  setup { @map = maps(:ahinvaux) }

  test "a new Markdown document is a .md file written by its author" do
    doc = MapDocument.build_markdown(map: @map, title: "Visite du 16 octobre", content: "# Visite\n", by: users(:michael), tags: [ "Visites" ])
    doc.save!
    assert_equal [ "visite-du-16-octobre.md", "text/markdown" ], [ doc.file.filename.to_s, doc.file.content_type ]
    assert doc.markdown?
    assert doc.editable_markdown?
    assert_equal "# Visite\n", doc.markdown_content
    assert_equal users(:michael), doc.content_edited_by
    assert_equal true, doc.as_inertia(url: ->(*) { "/x" })[:markdown]
  end

  test "replace_markdown! keeps the file name and refuses a text based on an old version" do
    doc = MapDocument.build_markdown(map: @map, title: "Journal", content: "Avant", by: users(:michael))
    doc.save!
    read = doc.content_checksum
    doc.replace_markdown!("Après", by: users(:alice), base: read)
    doc.reload
    assert_equal [ "Après", "journal.md", users(:alice) ], [ doc.markdown_content, doc.file.filename.to_s, doc.content_edited_by ]
    assert_raises(MapDocument::StaleContent) { doc.replace_markdown!("Écrasé", by: users(:michael), base: read) }
    assert_equal "Après", doc.reload.markdown_content
  end

  test "only Markdown files open as pages, and only when they are small enough" do
    pdf = @map.documents.new(uploaded_by: users(:michael))
    pdf.file.attach(io: file_fixture("rapport_labo.pdf").open, filename: "rapport_labo.pdf", content_type: "application/pdf")
    pdf.save!
    assert_not pdf.markdown?
    assert_raises(ArgumentError) { pdf.replace_markdown!("x", by: users(:michael)) }

    big = MapDocument.build_markdown(map: @map, title: "Long", content: "a" * (MapDocument::MAX_MARKDOWN_BYTES + 1), by: users(:michael))
    big.save!
    assert big.markdown?
    assert_not big.editable_markdown?
    assert_nil big.markdown_content
  end
end

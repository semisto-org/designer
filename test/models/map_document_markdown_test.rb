require "test_helper"

class MapDocumentMarkdownTest < ActiveSupport::TestCase
  include ActionCable::TestHelper

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

  test "a live save writes only a new text, keeps the shared edits and tells the page" do
    doc = MapDocument.build_markdown(map: @map, title: "Journal", content: "Avant", by: users(:michael))
    doc.save!
    doc.add_collab_update!("edit", epoch: 0)
    stream = MapDocumentChannel.broadcasting_for(doc)

    assert_no_difference -> { ActiveStorage::Blob.count } do
      assert_equal false, doc.replace_markdown!("Avant", by: users(:alice), live: true)
    end
    assert_equal users(:michael), doc.reload.content_edited_by

    assert_broadcasts(stream, 1) { assert doc.replace_markdown!("Après", by: users(:alice), live: true, epoch: 0) }
    assert_equal [ "Après", 0, 1 ], [ doc.reload.markdown_content, doc.collab_epoch, doc.collab_updates.count ]
    assert_equal({ "type" => "saved", "checksum" => doc.content_checksum, "epoch" => 0 }, JSON.parse(broadcasts(stream).last))
  end

  test "a write from elsewhere starts a new shared text; a late live save of the former one is refused" do
    doc = MapDocument.build_markdown(map: @map, title: "Journal", content: "Avant", by: users(:michael))
    doc.save!
    doc.add_collab_update!("edit", epoch: 0)
    stream = MapDocumentChannel.broadcasting_for(doc)

    doc.replace_markdown!("Réécrit par l'IA", by: users(:michael))
    assert_equal [ 1, 0 ], [ doc.reload.collab_epoch, doc.collab_updates.count ]
    assert_equal "reset", JSON.parse(broadcasts(stream).last)["type"]
    assert_equal({ epoch: 1, updates: [], lastId: nil }, doc.collab_state)

    assert_raises(MapDocument::StaleContent) { doc.replace_markdown!("Ancien texte", by: users(:alice), live: true, epoch: 0) }
    assert_equal false, doc.add_collab_update!("late", epoch: 0)
    assert_equal "Réécrit par l'IA", doc.reload.markdown_content
  end

  test "the shared edits come in order, and merge into one" do
    doc = MapDocument.build_markdown(map: @map, title: "Journal", content: "", by: users(:michael))
    doc.save!
    a = doc.add_collab_update!("a", epoch: 0)
    b = doc.add_collab_update!("b", epoch: 0)
    assert_equal({ epoch: 0, updates: [ Base64.strict_encode64("a"), Base64.strict_encode64("b") ], lastId: b.id }, doc.collab_state)
    assert_equal false, doc.compact_collab!("ab", last_id: b.id, epoch: 1)
    doc.compact_collab!("ab", last_id: b.id, epoch: 0)
    assert_equal [ [ b.id, "ab" ] ], doc.collab_updates.pluck(:id, :data)
    assert_not MapDocumentCollabUpdate.exists?(a.id)
    assert_not MapDocumentCollabUpdate.new(map_document: doc, data: "x" * (MapDocumentCollabUpdate::MAX_BYTES + 1)).valid?
  end
end

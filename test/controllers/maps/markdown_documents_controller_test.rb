require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

# Markdown documents of a map's library: their page, their text, and new ones.
class Maps::MarkdownDocumentsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @doc = MapDocument.build_markdown(map: @map, title: "Journal du jardin", content: "# Journal\n\n- [ ] Pailler", by: users(:michael))
    @doc.save!
  end

  test "everyone on the map reads the page, with its text and letterhead" do
    sign_in_as users(:alice)
    get map_document_path(@map, @doc), headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "maps/documents/show", body["component"]
    props = body["props"]
    assert_equal [ "# Journal\n\n- [ ] Pailler", false, nil ], [ props["content"], props["canEdit"], props["letterhead"] ]
    assert_equal @doc.content_checksum, props["checksum"]
    assert_equal true, props["document"]["markdown"]

    get content_map_document_path(@map, @doc), headers: json_headers
    assert_equal "# Journal\n\n- [ ] Pailler", response.parsed_body["content"]
  end

  test "a document that is not Markdown goes back to the library" do
    pdf = @map.documents.new(uploaded_by: users(:michael))
    pdf.file.attach(io: file_fixture("rapport_labo.pdf").open, filename: "rapport_labo.pdf", content_type: "application/pdf")
    pdf.save!
    sign_in_as users(:michael)
    get map_document_path(@map, pdf)
    assert_redirected_to map_documents_path(@map, open: pdf.id)
    patch content_map_document_path(@map, pdf), params: { content: "x" }, as: :json
    assert_response :unprocessable_entity
  end

  test "an editor saves the text; a save based on an old version gets the newer text back" do
    sign_in_as users(:michael)
    read = @doc.content_checksum
    patch content_map_document_path(@map, @doc), params: { content: "# Journal\n\n- [x] Pailler", base: read }, as: :json
    assert_response :success
    assert_equal "# Journal\n\n- [x] Pailler", @doc.reload.markdown_content
    assert_equal @doc.content_checksum, response.parsed_body["checksum"]
    assert_equal "Michael", response.parsed_body["document"]["contentEditedBy"]

    patch content_map_document_path(@map, @doc), params: { content: "Écrasé", base: read }, as: :json
    assert_response :conflict
    assert_equal "# Journal\n\n- [x] Pailler", response.parsed_body["content"]
    assert_match(/Michael/, response.parsed_body["message"])
    assert_equal "# Journal\n\n- [x] Pailler", @doc.reload.markdown_content
  end

  test "a viewer cannot write, and the text has a size limit" do
    sign_in_as users(:alice)
    patch content_map_document_path(@map, @doc), params: { content: "x" }, as: :json
    assert_response :forbidden
    sign_in_as users(:michael)
    patch content_map_document_path(@map, @doc), params: { content: "a" * (MapDocument::MAX_MARKDOWN_BYTES + 1) }, as: :json
    assert_response :unprocessable_entity
  end

  test "an editor writes a new document from a template, on the shelf they were on" do
    sign_in_as users(:michael)
    assert_difference -> { @map.documents.count } do
      post map_documents_path(@map), params: { document: { markdown: true, title: "Visite du 16 octobre", content: "# Visite\n", tags: [ "Visites" ] } }, as: :json
    end
    assert_response :created
    doc = @map.documents.find(response.parsed_body["id"])
    assert_equal [ "visite-du-16-octobre.md", "# Visite\n", [ "Visites" ], "library" ], [ doc.file.filename.to_s, doc.markdown_content, doc.tags, doc.origin ]

    post map_documents_path(@map), params: { document: { markdown: true, title: "", content: "" } }, as: :json
    assert_equal "Nouveau document", response.parsed_body["title"]
  end

  test "the page carries the team's logo" do
    team = Organization.create_with_admin!(users(:michael), name: "Semisto")
    team.logo.attach(io: file_fixture("plant.png").open, filename: "logo.png", content_type: "image/png")
    team.save!
    @map.update!(organization: team)
    sign_in_as users(:michael)
    get map_document_path(@map, @doc), headers: inertia_headers
    assert_equal({ "logoUrl" => team.logo_url, "name" => "Semisto" }, response.parsed_body["props"]["letterhead"])
  end

  test "editors join the shared text; readers do not" do
    @doc.add_collab_update!("edit", epoch: 0)
    sign_in_as users(:michael)
    get collab_map_document_path(@map, @doc), headers: json_headers
    assert_response :success
    assert_equal [ "# Journal\n\n- [ ] Pailler", 0, [ Base64.strict_encode64("edit") ] ], response.parsed_body.values_at("content", "epoch", "updates")

    sign_in_as users(:alice)
    get collab_map_document_path(@map, @doc), headers: json_headers
    assert_response :forbidden
  end

  test "a live save needs no base, credits whoever wrote, and is refused once the text was rewritten" do
    sign_in_as users(:michael)
    patch content_map_document_path(@map, @doc), params: { content: "Ensemble", live: true, mine: false, epoch: 0 }, as: :json
    assert_response :success
    assert_equal [ "Ensemble", users(:michael) ], [ @doc.reload.markdown_content, @doc.content_edited_by ]

    @doc.replace_markdown!("Réécrit", by: users(:michael))
    patch content_map_document_path(@map, @doc), params: { content: "En retard", live: true, epoch: 0 }, as: :json
    assert_response :conflict
    assert_equal "Réécrit", @doc.reload.markdown_content
  end
end

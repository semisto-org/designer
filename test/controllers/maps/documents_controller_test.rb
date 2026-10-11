require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"

class Maps::DocumentsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup { @map = maps(:ahinvaux) }

  def create_document(file = "rapport_labo.pdf", type = "application/pdf", **attrs)
    doc = @map.documents.new(uploaded_by: users(:michael), **attrs)
    doc.file.attach(io: file_fixture(file).open, filename: file, content_type: type)
    doc.save!
    doc
  end

  # The disk service signs the disposition into the redirect's token.
  def served_disposition
    token = URI(response.location).path.split("/")[-2]
    payload = JSON.parse(Base64.decode64(token.split("--").first))
    payload.dig("_rails", "data", "disposition").split(";").first
  end

  test "requires sign in, and someone outside the map gets nothing" do
    get map_documents_path(@map), headers: json_headers
    assert_redirected_to new_session_path
    sign_in_as users(:bob)
    get map_documents_path(@map), headers: json_headers
    assert_response :not_found
  end

  test "the library page lists the documents for a viewer, read-only" do
    create_document(tags: [ "Plans" ])
    sign_in_as users(:alice)
    get map_documents_path(@map), headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "maps/documents/index", body["component"]
    props = body["props"]
    assert_equal false, props["canEdit"]
    assert_equal 200.megabytes, props["limits"]["maxBytes"]
    doc = props["documents"].sole
    assert_equal [ "Plans" ], doc["tags"]
    assert_equal "pdf", doc["preview"]
    assert_equal file_map_document_path(@map, doc["id"], size: "original"), doc["previewUrl"]
    assert_equal "Michael", doc["uploadedBy"]
  end

  test "a viewer cannot add, edit or remove" do
    doc = create_document
    sign_in_as users(:alice)
    post map_documents_path(@map), params: { document: { file: upload("rapport_labo.pdf", "application/pdf") } }, headers: json_headers
    assert_response :forbidden
    patch map_document_path(@map, doc), params: { document: { title: "x" } }, as: :json
    assert_response :forbidden
    delete map_document_path(@map, doc), as: :json
    assert_response :forbidden
    assert_equal 1, @map.documents.count
  end

  test "an editor adds a PDF with its first page as a thumbnail and tags" do
    sign_in_as users(:michael)
    assert_difference -> { @map.documents.count } do
      post map_documents_path(@map), headers: json_headers, params: {
        document: { file: upload("rapport_labo.pdf", "application/pdf"), thumbnail: upload("terrain.jpg", "image/jpeg"), tags: [ "Analyses de sol" ] }
      }
    end
    assert_response :created
    body = response.parsed_body
    assert_equal "rapport labo", body["title"]
    assert_equal [ "Analyses de sol" ], body["tags"]
    assert body["thumbUrl"].present?
    doc = @map.documents.last
    assert_equal users(:michael), doc.uploaded_by
    assert doc.thumbnail.attached?
  end

  test "a document added from the project sheet says so" do
    sign_in_as users(:michael)
    post map_documents_path(@map), params: { document: { file: upload("notes.txt", "text/plain"), origin: "project_sheet" } }, headers: json_headers
    assert_response :created
    assert_equal "project_sheet", @map.documents.last.origin
  end

  test "a refused file says why" do
    sign_in_as users(:michael)
    post map_documents_path(@map), params: { document: { file: Rack::Test::UploadedFile.new(StringIO.new("<p>"), "text/html", original_filename: "page.html") } }, headers: json_headers
    assert_response :unprocessable_entity
    assert_match "page.html", response.parsed_body["message"]
  end

  test "an editor renames, notes, tags and removes a document" do
    doc = create_document
    sign_in_as users(:michael)
    patch map_document_path(@map, doc), params: { document: { title: "Analyse de sol 2026", description: "Labo de Gembloux", tags: [ "Sol" ] } }, as: :json
    assert_response :success
    doc.reload
    assert_equal [ "Analyse de sol 2026", "Labo de Gembloux", [ "Sol" ] ], [ doc.title, doc.description, doc.tags ]
    patch map_document_path(@map, doc), params: { document: { tags: [] } }, as: :json
    assert_equal [], doc.reload.tags
    delete map_document_path(@map, doc), as: :json
    assert_response :no_content
    assert_equal 0, @map.documents.count
  end

  test "the file is shown inline when the browser can preview it, downloaded otherwise" do
    pdf = create_document
    text = create_document("notes.txt", "text/plain")
    sign_in_as users(:alice)
    get file_map_document_path(@map, pdf, size: "original")
    assert_response :redirect
    assert_equal "inline", served_disposition
    get file_map_document_path(@map, pdf, size: "download")
    assert_equal "attachment", served_disposition
    get file_map_document_path(@map, text)
    assert_equal "attachment", served_disposition
    get file_map_document_path(@map, text, size: "thumb")
    assert_response :not_found
  end

  test "an image document has a thumbnail variant" do
    doc = create_document("terrain.jpg", "image/jpeg")
    sign_in_as users(:alice)
    get file_map_document_path(@map, doc, size: "thumb")
    assert_response :redirect
  end

  test "the project sheet page carries the documents sent with it" do
    create_document(origin: "project_sheet")
    create_document("notes.txt", "text/plain")
    sign_in_as users(:michael)
    get map_project_path(@map), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal [ "rapport labo" ], props["documents"].map { _1["title"] }
    assert_equal 200.megabytes, props["documentLimits"]["maxBytes"]
  end
end

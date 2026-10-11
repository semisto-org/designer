require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

class ProjectFormDocumentsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @link = @map.create_project_sheet_link!(created_by: users(:michael))
  end

  def send_document(file = "rapport_labo.pdf", type = "application/pdf", token: @link.token)
    post project_form_documents_path(token), params: { document: { file: upload(file, type) } }, headers: json_headers
  end

  test "the people behind the project send a document without an account: it lands in the map's library" do
    assert_difference -> { @map.documents.count } do
      send_document
    end
    assert_response :created
    doc = @map.documents.last
    assert_equal "project_sheet", doc.origin
    assert_equal @link, doc.project_sheet_link
    assert_nil doc.uploaded_by
    assert_equal project_form_document_file_path(@link.token, doc, size: "original"), response.parsed_body["previewUrl"]
    assert_equal true, response.parsed_body["fromProjectLink"]
  end

  test "the form page lists only what was sent through the link" do
    send_document
    team = @map.documents.new(uploaded_by: users(:michael), origin: "project_sheet")
    team.file.attach(io: file_fixture("notes.txt").open, filename: "notes.txt", content_type: "text/plain")
    team.save!
    get project_form_path(@link.token), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal [ "rapport labo" ], props["documents"].map { _1["title"] }
    get project_form_documents_path(@link.token), headers: json_headers
    assert_equal [ "rapport labo" ], response.parsed_body["documents"].map { _1["title"] }
    get project_form_document_file_path(@link.token, team)
    assert_response :not_found
  end

  test "they open and remove what they sent, nothing else" do
    send_document
    doc = @map.documents.last
    get project_form_document_file_path(@link.token, doc, size: "download")
    assert_response :redirect
    delete project_form_document_path(@link.token, doc), headers: json_headers
    assert_response :no_content
    assert_equal 0, @map.documents.count
  end

  test "a switched-off link sends nothing" do
    @link.disable!
    send_document
    assert_response :gone
    assert_equal 0, @map.documents.count
  end

  test "the team keeps the documents when the link goes away" do
    send_document
    @link.destroy!
    doc = @map.documents.sole
    assert_nil doc.project_sheet_link_id
    assert_equal "project_sheet", doc.origin
  end
end

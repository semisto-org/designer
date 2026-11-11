require "test_helper"
require_relative "../../test_helpers/soil_photos_helper"
require_relative "../../test_helpers/office_pdf_test_helper"

class Maps::DocumentsControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper
  include OfficePdfTestHelper
  include ActiveJob::TestHelper

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
    get map_documents_path(@map)
    assert_redirected_to new_session_path
    get map_documents_path(@map), headers: json_headers
    assert_response :unauthorized
    assert_equal "signed_out", response.parsed_body["code"]
    sign_in_as users(:bob)
    get map_documents_path(@map), headers: json_headers
    assert_response :not_found
  end

  # Signed out in another tab: the upload must fail out loud. A redirect to
  # the sign-in page was followed by the browser and read as a success.
  test "an upload from a signed-out browser is refused as signed out, not redirected" do
    assert_no_difference -> { MapDocument.count } do
      post map_documents_path(@map), params: { document: { file: fixture_file_upload("rapport_labo.pdf", "application/pdf") } },
        headers: { "Accept" => "application/json" }
    end
    assert_response :unauthorized
    assert_equal I18n.t("sessions.signed_out"), response.parsed_body["message"]
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

  # The phone app opens a message's PDF in the system browser, which has no
  # token: it asks for the short-lived link as JSON instead of a redirect.
  test "the phone app gets a document's link as JSON, with the same access rules" do
    doc = create_document(in_library: false, origin: "chat")
    token = ->(user) { { "Authorization" => "Bearer #{OauthAccessToken.issue!(user:, client: MobileApp.client, scopes: MobileApp::SCOPES, resource: nil).plaintext_token}", "Accept" => "application/json" } }

    get file_map_document_path(@map, doc, size: "original"), headers: token.(users(:michael))
    assert_response :success
    assert_match %r{/rails/active_storage/}, response.parsed_body["url"]
    assert response.parsed_body["expiresAt"].present?

    get file_map_document_path(@map, doc, size: "original"), headers: token.(users(:alice))
    assert_response :not_found

    # Without asking for JSON, it is still a redirect.
    get file_map_document_path(@map, doc, size: "download"), headers: token.(users(:michael)).except("Accept")
    assert_response :redirect
  end

  test "a file joined to a message stays out of the library, for the discussion's members, until added" do
    sign_in_as users(:michael)
    assert_no_difference -> { @map.documents.count } do
      post map_documents_path(@map), headers: json_headers, params: { document: { file: upload("rapport_labo.pdf", "application/pdf"), origin: "chat" } }
    end
    assert_response :created
    assert_equal false, response.parsed_body["inLibrary"]
    doc = @map.all_documents.find(response.parsed_body["id"])
    assert_equal "chat", doc.origin

    get map_documents_path(@map), headers: json_headers
    assert_not_includes response.parsed_body["documents"].map { _1["id"] }, doc.id

    # A viewer outside the discussion does not open it.
    sign_in_as users(:alice)
    get file_map_document_path(@map, doc, size: "download")
    assert_response :not_found
    @map.memberships.find_by(user: users(:alice)).update!(chat_access: true)
    get file_map_document_path(@map, doc, size: "download")
    assert_response :redirect

    sign_in_as users(:michael)
    patch map_document_path(@map, doc), headers: json_headers, params: { document: { in_library: true } }
    assert_response :success
    assert doc.reload.in_library?
    assert_equal "rapport_labo", doc.title.tr(" ", "_")
    get map_documents_path(@map), headers: json_headers
    assert_includes response.parsed_body["documents"].map { _1["id"] }, doc.id

    # Never taken out again by an update.
    patch map_document_path(@map, doc), headers: json_headers, params: { document: { in_library: false, title: "Rapport" } }
    assert doc.reload.in_library?
    assert_equal "Rapport", doc.title
  end

  test "a document added from the project sheet says so" do
    sign_in_as users(:michael)
    post map_documents_path(@map), params: { document: { file: upload("notes.txt", "text/plain"), origin: "project_sheet" } }, headers: json_headers
    assert_response :created
    assert_equal "project_sheet", @map.documents.last.origin
  end

  test "any file is filed, and a web page is only ever downloaded" do
    sign_in_as users(:michael)
    post map_documents_path(@map), params: { document: { file: Rack::Test::UploadedFile.new(StringIO.new("<p>"), "text/html", original_filename: "page.html") } }, headers: json_headers
    assert_response :created
    doc = @map.documents.last
    assert_equal "page.html", doc.file.filename.to_s
    %w[original large].each do |size|
      get file_map_document_path(@map, doc, size:)
      assert_equal "attachment", served_disposition
    end
  end

  test "a refused file says why" do
    sign_in_as users(:michael)
    post map_documents_path(@map), params: { document: { title: "Sans fichier" } }, headers: json_headers
    assert_response :unprocessable_entity
    assert_match "Choisis un fichier", response.parsed_body["message"]
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

  test "an editor turns a .docx into a PDF, which then joins the library beside it" do
    with_fake_libreoffice do
      source = attach_docx(@map)
      sign_in_as users(:michael)
      get map_documents_path(@map), headers: json_headers
      listed = response.parsed_body["documents"].sole
      assert_equal [ true, nil, nil ], listed.values_at("convertibleToPdf", "pdfConversion", "pdfCopyId")

      post pdf_map_document_path(@map, source), headers: json_headers
      assert_response :accepted
      assert_equal "pending", response.parsed_body["pdfConversion"]
      assert_enqueued_jobs 1, only: ConvertMapDocumentToPdfJob

      perform_enqueued_jobs(only: ConvertMapDocumentToPdfJob)
      get map_documents_path(@map), headers: json_headers
      copy, listed = response.parsed_body["documents"].partition { _1["convertedFromId"] }.map(&:sole)
      assert_equal copy["id"], listed["pdfCopyId"]
      assert_nil listed["pdfConversion"]
      assert_equal [ "pdf", false ], copy.values_at("preview", "convertibleToPdf")
    end
  end

  test "a viewer cannot convert, and only word-processor files are converted" do
    with_fake_libreoffice do
      source = attach_docx(@map)
      sign_in_as users(:alice)
      post pdf_map_document_path(@map, source), headers: json_headers
      assert_response :forbidden
      sign_in_as users(:michael)
      post pdf_map_document_path(@map, create_document), headers: json_headers
      assert_response :unprocessable_entity
      assert_no_enqueued_jobs only: ConvertMapDocumentToPdfJob
    end
  end
end

require "test_helper"
require "test_helpers/mcp_test_helper"

# Files the AI sends itself: create_upload, an HTTP PUT, then attach_photos
# or attach_documents; and files the server fetches (import_from_url).
class McpUploadsTest < ActionDispatch::IntegrationTest
  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
  end

  def spec(file, kind:, type:, name: file, bytes: file_fixture(file).binread)
    { kind:, filename: name, byte_size: bytes.bytesize, checksum: Digest::MD5.base64digest(bytes), content_type: type }
  end

  def prepare(*files, token: @owner, map: @map)
    data, error = call_tool(token, "create_upload", { map_id: map.id, files: })
    flunk(data) if error
    data
  end

  # The PUT the AI makes with curl.
  def send_file(upload, bytes)
    put URI(upload["upload_url"]).request_uri, params: bytes, headers: upload["headers"]
    assert_response :no_content
  end

  test "create_upload signs one URL per file and refuses what could never be attached" do
    data = prepare(
      spec("terrain_gps.jpg", kind: "photo", type: "image/jpeg"),
      spec("analyse_sol.pdf", kind: "photo", type: "application/pdf"),
      spec("analyse_sol.pdf", kind: "document", type: "application/pdf", name: "releve.e57"),
      spec("terrain.jpg", kind: "photo", type: "image/jpeg").merge(byte_size: 30.megabytes),
      spec("terrain.jpg", kind: "photo", type: "image/jpeg").merge(checksum: "pas une empreinte MD5...")
    )
    upload, scan = data["uploads"]
    assert_equal "releve.e57", scan["filename"]
    assert_match %r{\Ahttp://www.example.com/rails/active_storage/disk/}, upload["upload_url"]
    assert_equal "image/jpeg", upload.dig("headers", "Content-Type")
    assert_match(/\Acurl --fail -X PUT --data-binary @terrain_gps.jpg -H Content-Type:\\ image\/jpeg/, upload["curl"])
    assert_equal %w[unsupported_type too_large invalid_checksum], data["rejected"].map { _1["code"] }
    assert_equal({ "prepared" => 2, "rejected" => 3 }, AiAction.last.result)
    assert_equal [ @map, users(:michael), "photo", nil ], McpUpload.order(:id).first.values_at(:map_id, :user_id, :kind, :attached_at).then { [ Map.find(_1[0]), User.find(_1[1]), _1[2], _1[3] ] }

    text, error = call_tool(@viewer, "create_upload", { map_id: @map.id, files: [ spec("terrain.jpg", kind: "photo", type: "image/jpeg") ] })
    assert error
    assert_match(/éditeurs/, text)
  end

  test "attach_photos dates and places photos from their EXIF, files them in an album, and refuses a second use" do
    gps = file_fixture("terrain_gps.jpg").binread
    plain = file_fixture("drone_dji.jpg").binread
    data = prepare(spec("terrain_gps.jpg", kind: "photo", type: "image/jpeg"), spec("drone_dji.jpg", kind: "photo", type: "image/jpeg"))
    first, second = data["uploads"]
    send_file(first, gps)

    data, error = call_tool(@owner, "attach_photos", { map_id: @map.id, photos: [
      { signed_id: first["signed_id"], album_name: "Vues aériennes (16/07)" },
      { signed_id: second["signed_id"], album_name: "Vues aériennes (16/07)" }
    ] })
    refute error
    assert_equal [ "not_received" ], data["rejected"].map { _1["code"] }, "the second PUT was never made"
    photo = @map.photos.find(data["attached"].sole["id"])
    assert_equal Time.zone.parse("2026-05-17 14:32:10"), photo.taken_at
    assert_equal [ [ 4.9075, 50.341 ], "exif", 135.0 ], [ photo.lnglat, photo.location_source, photo.heading ]
    assert_equal "Vues aériennes (16/07)", photo.album.name
    assert_equal [ users(:michael), "import" ], [ photo.uploaded_by, photo.source ]
    assert McpUpload.find_by!(blob_id: photo.image.blob.id).attached?

    send_file(second, plain)
    data, = call_tool(@owner, "attach_photos", { map_id: @map.id, photos: [
      { signed_id: second["signed_id"], album_name: "vues aériennes (16/07)", caption: "Le verger vu du ciel", taken_at: "2026-07-16T10:00:00+02:00" },
      { signed_id: first["signed_id"] }
    ] })
    drone = @map.photos.find(data["attached"].sole["id"])
    assert_equal [ "Le verger vu du ciel", Time.zone.parse("2026-07-16 10:00") ], [ drone.caption, drone.taken_at ]
    assert_equal photo.album, drone.album, "the album is found again by its name"
    assert_equal [ "already_attached" ], data["rejected"].map { _1["code"] }
  end

  test "a photo already on the map, or a file that is not a photo, is refused one by one" do
    bytes = file_fixture("terrain_gps.jpg").binread
    data = prepare(spec("terrain_gps.jpg", kind: "photo", type: "image/jpeg"), spec("terrain_gps.jpg", kind: "photo", type: "image/jpeg", name: "copie.jpg"),
      spec("analyse_sol.pdf", kind: "photo", type: "image/jpeg", name: "faux.jpg"))
    data["uploads"].first(2).each { send_file(_1, bytes) }
    send_file(data["uploads"].last, file_fixture("analyse_sol.pdf").binread)
    data, = call_tool(@owner, "attach_photos", { map_id: @map.id, photos: data["uploads"].map { { signed_id: _1["signed_id"] } } })
    assert_equal 1, data["attached"].size
    assert_equal %w[duplicate unsupported_type], data["rejected"].map { _1["code"] }
  end

  test "a signed_id made for another map is refused with its code" do
    other = Map.create!(name: "Barsy", owner: users(:michael), region: regions(:wallonia))
    bytes = file_fixture("terrain.jpg").binread
    upload = prepare(spec("terrain.jpg", kind: "photo", type: "image/jpeg"), map: other)["uploads"].sole
    send_file(upload, bytes)
    text, error = call_tool(@owner, "attach_photos", { map_id: @map.id, photos: [ { signed_id: upload["signed_id"] } ] })
    assert error
    assert_match(/other_map/, text)
    assert_match(/autre carte \(n° #{other.id}\)/, text)

    text, error = call_tool(@owner, "attach_documents", { map_id: @map.id, documents: [ { signed_id: "nimporte-quoi-pas-signe", title: "x" } ] })
    assert error
    assert_match(/unknown_upload/, text)
    data, error = call_tool(@owner, "attach_photos", { map_id: other.id, photos: [ { signed_id: upload["signed_id"] } ] })
    refute error, data
  end

  test "attach_documents files a PDF and a Word file that get_document then reads" do
    pdf = file_fixture("analyse_sol.pdf").binread
    docx = word_file("Compte rendu de visite")
    data = prepare(spec("analyse_sol.pdf", kind: "document", type: "application/pdf"),
      spec("visite.docx", kind: "document", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: docx))
    send_file(data["uploads"][0], pdf)
    send_file(data["uploads"][1], docx)
    data, error = call_tool(@owner, "attach_documents", { map_id: @map.id, documents: [
      { signed_id: data["uploads"][0]["signed_id"], title: "Analyse de sol du labo", tags: [ "Sol" ] },
      { signed_id: data["uploads"][1]["signed_id"], title: "Visite", description: "Compte rendu de la visite." }
    ] })
    refute error
    pdf_doc, word_doc = data["attached"]
    assert_equal [ "pdf", [ "Sol" ] ], pdf_doc.values_at("kind", "tags")
    assert_equal "text", word_doc["kind"]

    read, = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: pdf_doc["id"] })
    assert_match(/pH eau : 6\.4/, read["text"])
    read, = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: word_doc["id"] })
    assert_equal "Compte rendu de visite", read["text"]
  end

  test "a PDF that is not one by its bytes is refused" do
    bytes = "MZ\x90\x00 programme".b
    upload = prepare(spec("x", kind: "document", type: "application/pdf", name: "offre.pdf", bytes:))["uploads"].sole
    send_file(upload, bytes)
    text, error = call_tool(@owner, "attach_documents", { map_id: @map.id, documents: [ { signed_id: upload["signed_id"], title: "Offre" } ] })
    assert error
    assert_match(/type_mismatch/, text)
  end

  test "import_from_url fetches a public file, and refuses private addresses and web pages" do
    pdf = file_fixture("analyse_sol.pdf").binread
    stub_request(:get, "https://files.example.org/analyse.pdf").to_return(body: pdf, headers: { "Content-Type" => "application/pdf" })
    stub_request(:get, "https://drive.google.com/uc?export=download&id=abc_123")
      .to_return(body: file_fixture("terrain_gps.jpg").binread, headers: { "Content-Type" => "image/jpeg", "Content-Disposition" => 'attachment; filename="IMG_0042.jpg"' })
    stub_request(:get, "https://files.example.org/apercu").to_return(body: "<html></html>", headers: { "Content-Type" => "text/html" })
    resolver = ->(host) { host == "intranet.example.org" ? [ "10.0.0.5" ] : [ "93.184.216.34" ] }
    Mcp::RemoteFile.stub_resolver(resolver) do
      data, error = call_tool(@owner, "import_from_url", { map_id: @map.id, files: [
        { url: "https://files.example.org/analyse.pdf", kind: "document", title: "Analyse", tags: [ "Sol" ] },
        { url: "https://drive.google.com/file/d/abc_123/view?usp=sharing", kind: "photo", caption: "Depuis Drive" },
        { url: "https://intranet.example.org/secret.pdf", kind: "document" },
        { url: "http://files.example.org/analyse.pdf", kind: "document" },
        { url: "https://files.example.org/apercu", kind: "document" }
      ] })
      refute error
      assert_equal %w[document photo], data["imported"].map { _1["kind"] }
      assert_equal %w[private_address https_only not_a_file], data["rejected"].map { _1["code"] }
      photo = @map.photos.find(data["imported"].last["id"])
      assert_equal [ "IMG_0042.jpg", "Depuis Drive", [ 4.9075, 50.341 ] ], [ photo.image.filename.to_s, photo.caption, photo.lnglat ]
      assert_equal [ { "kind" => "document", "host" => "files.example.org" } ], AiAction.last.arguments["files"].first(1)
    end
    assert_not_requested :get, "https://intranet.example.org/secret.pdf"
  end

  test "delete_documents deletes the documents named, for editors only" do
    doc = @map.documents.new(uploaded_by: users(:michael), title: "Erreur")
    doc.file.attach(io: StringIO.new("x"), filename: "erreur.txt", content_type: "text/plain")
    doc.save!
    _, error = call_tool(@viewer, "delete_documents", { map_id: @map.id, document_ids: [ doc.id ] })
    assert error
    data, error = call_tool(@owner, "delete_documents", { map_id: @map.id, document_ids: [ doc.id, 999_999 ] })
    refute error
    assert_equal [ [ doc.id ], [ 999_999 ] ], data.values_at("deleted", "not_found")
    refute MapDocument.exists?(doc.id)
  end

  test "uploads never attached are purged after a day, attached ones stay" do
    bytes = file_fixture("terrain.jpg").binread
    uploads = prepare(spec("terrain.jpg", kind: "photo", type: "image/jpeg"), spec("terrain_gps.jpg", kind: "photo", type: "image/jpeg"))["uploads"]
    send_file(uploads[0], bytes)
    call_tool(@owner, "attach_photos", { map_id: @map.id, photos: [ { signed_id: uploads[0]["signed_id"] } ] })
    travel 25.hours do
      assert_difference -> { ActiveStorage::Blob.count } => -1, -> { McpUpload.count } => -1 do
        McpUploadPurgeJob.perform_now
      end
    end
    assert @map.photos.sole.image.attached?
  end

  private
    def word_file(text)
      buffer = Zip::OutputStream.write_buffer do |zip|
        zip.put_next_entry("word/document.xml")
        zip.write(%(<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>#{text}</w:t></w:r></w:p></w:body></w:document>))
      end
      buffer.string
    end
end

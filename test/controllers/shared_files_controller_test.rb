require "test_helper"
require_relative "../test_helpers/soil_photos_helper"

# « Copier le lien » (the map's own page, for its members) and « Lien
# public » (one file alone, for someone without an account, until cut).
class SharedFilesControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
  end

  def create_document(**attrs)
    doc = @map.documents.new(uploaded_by: @owner, title: "Plan de plantation", **attrs)
    doc.file.attach(io: file_fixture("rapport_labo.pdf").open, filename: "plan.pdf", content_type: "application/pdf")
    doc.save!
    doc
  end

  test "share paths reopen the photo or the document on the map's pages" do
    photo = create_photo
    doc = create_document
    assert_equal "/maps/#{@map.id}/photos?open=#{photo.id}", photo.share_path
    assert_equal "/maps/#{@map.id}/documents?open=#{doc.id}", doc.share_path
    doc.update!(in_library: false)
    assert_nil doc.share_path, "a file of the discussion only is not on the shelves"
  end

  test "a shared page sends a signed-out visitor to sign in, then back to the same photo" do
    photo = create_photo
    get photo.share_path
    assert_redirected_to new_session_path
    assert_equal "http://www.example.com#{photo.share_path}", session[:return_to_after_authenticating]
    sign_in_as @owner
    get photo.share_path
    assert_response :success
  end

  test "editors make and cut a public link; viewers cannot" do
    photo = create_photo
    sign_in_as users(:alice)
    patch map_photo_path(@map, photo), params: { photo: { public_link: true } }, as: :json
    assert_response :forbidden
    assert_nil photo.reload.share_token

    sign_in_as @owner
    patch map_photo_path(@map, photo), params: { photo: { public_link: true } }, as: :json
    assert_response :success
    token = photo.reload.share_token
    assert_equal PubliclyShareable::TOKEN_LENGTH, token.length
    assert_equal "/partage/photo/#{token}", response.parsed_body["publicPath"]

    patch map_photo_path(@map, photo), params: { photo: { public_link: true } }, as: :json
    assert_equal token, photo.reload.share_token, "the link already given stays good"

    doc = create_document
    patch map_document_path(@map, doc), params: { document: { public_link: true } }, as: :json
    assert_response :success
    assert_match %r{\A/partage/document/\w{24}\z}, response.parsed_body["publicPath"]
    patch map_document_path(@map, doc), params: { document: { public_link: false } }, as: :json
    assert_nil doc.reload.share_token
    assert_nil response.parsed_body["publicPath"]
  end

  test "a public link opens the file alone, without an account, never indexed" do
    photo = create_photo(caption: "Le verger")
    photo.update!(public_link: true)
    get shared_photo_path(photo.share_token)
    assert_response :redirect
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
    assert_no_match(/terrain\.jpg\z/, URI(response.location).path, "the large still, not the original with its EXIF")

    doc = create_document
    doc.update!(public_link: true)
    get shared_document_path(doc.share_token)
    assert_response :redirect
    get shared_document_path(doc.share_token, download: 1)
    assert_response :redirect
  end

  test "a cut link, a wrong one or a deleted file leads nowhere" do
    photo = create_photo
    photo.update!(public_link: true)
    token = photo.share_token
    photo.update!(public_link: false)
    get shared_photo_path(token)
    assert_response :gone
    assert_match(/coupé/, response.body)

    get shared_photo_path("x" * PubliclyShareable::TOKEN_LENGTH)
    assert_response :gone
    get shared_document_path("short")
    assert_response :gone

    doc = create_document
    doc.update!(public_link: true)
    token = doc.share_token
    doc.destroy!
    get shared_document_path(token)
    assert_response :gone
  end

  test "a photo's token does not open a document" do
    photo = create_photo
    photo.update!(public_link: true)
    get shared_document_path(photo.share_token)
    assert_response :gone
  end
end

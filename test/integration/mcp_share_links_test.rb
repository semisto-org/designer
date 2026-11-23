require "test_helper"
require "test_helpers/mcp_test_helper"
require_relative "../test_helpers/soil_photos_helper"

# The user's AI hands out the link of each photo and document (for the
# map's members) and, when asked, makes or cuts its public link.
class McpShareLinksTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = personal_token(users(:michael))
    @viewer = personal_token(users(:alice))
    @document = @map.documents.new(uploaded_by: users(:michael), title: "Plan de plantation")
    @document.file.attach(io: file_fixture("rapport_labo.pdf").open, filename: "plan.pdf", content_type: "application/pdf")
    @document.save!
    @photo = create_photo
  end

  test "photos and documents carry the link that reopens them" do
    photos, = call_tool(@viewer, "list_photos", { map_id: @map.id })
    assert_match %r{/maps/#{@map.id}/photos\?open=#{@photo.id}\z}, photos["photos"].find { _1["id"] == @photo.id }["link"]
    doc, error = call_tool(@viewer, "get_document", { map_id: @map.id, document_id: @document.id })
    refute error, doc
    assert_match %r{/maps/#{@map.id}/documents\?open=#{@document.id}\z}, doc["link"]
    assert_nil doc["public_link"]
  end

  test "update_photos and update_document make and cut the public link, for editors only" do
    _, error = call_tool(@viewer, "update_photos", { map_id: @map.id, photos: [ { photo_id: @photo.id, public_link: true } ] })
    assert error

    data, error = call_tool(@owner, "update_photos", { map_id: @map.id, photos: [ { photo_id: @photo.id, public_link: true } ] })
    refute error, data
    assert_match %r{/partage/photo/#{@photo.reload.share_token}\z}, data["updated"].first["public_link"]

    data, error = call_tool(@owner, "update_document", { map_id: @map.id, document_id: @document.id, public_link: true })
    refute error, data
    assert_match %r{/partage/document/\w{24}\z}, data["public_link"]
    data, = call_tool(@owner, "update_document", { map_id: @map.id, document_id: @document.id, public_link: false })
    assert_nil data["public_link"]
    assert_nil @document.reload.share_token
  end
end

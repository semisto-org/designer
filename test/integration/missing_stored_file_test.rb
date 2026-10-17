require "test_helper"

# SEMISTO-DESIGNER-S: a blob whose file is gone from the bucket made every
# request for one of its variants answer 500 (and reach Sentry each time).
class MissingStoredFileTest < ActionDispatch::IntegrationTest
  setup do
    @blob = ActiveStorage::Blob.create_and_upload!(io: file_fixture("plant.png").open, filename: "plant.png", content_type: "image/png")
    @blob.service.delete(@blob.key)
  end

  test "a variant of a blob whose file is missing answers 404, not 500" do
    get rails_representation_path(@blob.variant(resize_to_limit: [ 64, 64 ]), only_path: true)
    assert_response :not_found
  end
end

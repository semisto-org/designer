# A real, tiny PNG (1 × 1 px) for upload tests.
module PngTestHelper
  PNG_1PX = Base64.decode64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

  def png_upload(bytes = PNG_1PX, content_type: "image/png", name: "preview.png")
    Rack::Test::UploadedFile.new(StringIO.new(bytes), content_type, true, original_filename: name)
  end
end

ActiveSupport::TestCase.include PngTestHelper
ActionDispatch::IntegrationTest.include PngTestHelper

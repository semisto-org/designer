require "test_helper"

# config/storage.yml: the S3-compatible service is built from S3_* variables.
class ObjectStorageTest < ActiveSupport::TestCase
  ENV_KEYS = %w[S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_FORCE_PATH_STYLE].freeze

  def build_service(env)
    saved = ENV.to_h.slice(*ENV_KEYS)
    ENV_KEYS.each { |key| ENV.delete(key) }
    env.each { |key, value| ENV[key] = value }
    configs = ActiveSupport::ConfigurationFile.parse(Rails.root.join("config/storage.yml")).deep_symbolize_keys
    ActiveStorage::Service.configure(:object_storage, configs)
  ensure
    ENV_KEYS.each { |key| ENV.delete(key) }
    saved.each { |key, value| ENV[key] = value }
  end

  HETZNER = {
    "S3_ENDPOINT" => "https://fsn1.your-objectstorage.com", "S3_REGION" => "fsn1", "S3_BUCKET" => "designer-media",
    "S3_ACCESS_KEY_ID" => "AKIATEST", "S3_SECRET_ACCESS_KEY" => "secret"
  }.freeze

  test "builds an S3 service from the environment, path style by default" do
    service = build_service(HETZNER)
    assert_kind_of ActiveStorage::Service::S3Service, service
    config = service.client.client.config
    assert_equal "https://fsn1.your-objectstorage.com", config.endpoint.to_s
    assert_equal "fsn1", config.region
    assert config.force_path_style
    assert_equal "designer-media", service.bucket.name
    assert_equal "when_required", config.request_checksum_calculation
    assert_equal "when_required", config.response_checksum_validation
  end

  test "virtual-hosted style can be chosen" do
    service = build_service(HETZNER.merge("S3_FORCE_PATH_STYLE" => "false"))
    assert_not service.client.client.config.force_path_style
  end

  test "files are served through presigned links on the provider's endpoint, never public" do
    service = build_service(HETZNER)
    url = service.url("some-key", expires_in: 300, filename: ActiveStorage::Filename.new("photo.jpg"), content_type: "image/jpeg", disposition: :inline)
    assert url.start_with?("https://fsn1.your-objectstorage.com/designer-media/some-key?"), url
    assert_includes url, "X-Amz-Signature="
    assert_includes url, "X-Amz-Expires=300"
    assert_not service.public?
  end

  test "production picks the object storage when S3_BUCKET is set, the local disk otherwise" do
    source = Rails.root.join("config/environments/production.rb").read
    assert_includes source, 'ENV["S3_BUCKET"].present? ? :object_storage : :local'
    assert_includes Rails.root.join("config/storage.yml").read, "object_storage:"
  end

  test "tests keep using the local test service" do
    assert_equal :test, Rails.configuration.active_storage.service
  end
end

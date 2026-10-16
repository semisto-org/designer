require "test_helper"
require "aws-sdk-s3"

class FileStorage::CorsTest < ActiveSupport::TestCase
  test "lets the app's origin read files and the ranges pdf.js asks for" do
    rule = FileStorage::Cors.rules("https://designer.semisto.org").sole
    assert_equal [ "https://designer.semisto.org" ], rule[:allowed_origins]
    assert_equal %w[GET HEAD], rule[:allowed_methods]
    assert_includes rule[:expose_headers], "Content-Range"
  end

  test "puts the rule on the bucket" do
    client = Aws::S3::Client.new(stub_responses: true)
    FileStorage::Cors.apply(client:, bucket: "designer-media", origins: "https://designer.semisto.org")

    request = client.api_requests.sole
    assert_equal :put_bucket_cors, request[:operation_name]
    assert_equal "designer-media", request[:params][:bucket]
    assert_equal [ "https://designer.semisto.org" ], request[:params][:cors_configuration][:cors_rules].sole[:allowed_origins]
  end

  test "allows the app's primary host" do
    assert_equal "https://#{AppHosts.primary}", FileStorage::Cors.app_origin
  end

  test "the boot step does nothing without a bucket, and never fails" do
    Rails.application.load_tasks unless Rake::Task.task_defined?("storage:cors_on_boot")
    Rake::Task["storage:cors_on_boot"].reenable
    assert_nothing_raised { Rake::Task["storage:cors_on_boot"].invoke }
  end
end

require "test_helper"

class Providers::MagnificTest < ActiveSupport::TestCase
  URL = "https://api.magnific.com/v1/ai/text-to-image/nano-banana-pro".freeze

  def magnific = Providers::Magnific.new(api_key: "secret")

  def task_body(status, generated = []) = { data: { task_id: "task-1", status:, generated: } }.to_json

  test "not configured without a key" do
    refute Providers::Magnific.new(api_key: nil).configured?
    assert_raises(Providers::Magnific::NotConfigured) { Providers::Magnific.new(api_key: nil).create(prompt: "x", image_url: "https://e/x.jpg", content_type: "image/jpeg") }
  end

  test "creates a task with the reference image, keeping its proportions" do
    stub = stub_request(:post, URL)
      .with(headers: { "x-magnific-api-key" => "secret" }) { |request|
        body = JSON.parse(request.body)
        body["aspect_ratio"] == "auto" && body["prompt"] == "Paint it" &&
          body["reference_images"] == [ { "image" => "https://designer.test/in.jpg", "mime_type" => "image/jpeg" } ]
      }
      .to_return(status: 200, body: task_body("CREATED"), headers: { "Content-Type" => "application/json" })

    task = magnific.create(prompt: "Paint it", image_url: "https://designer.test/in.jpg", content_type: "image/jpeg")
    assert_requested stub
    assert_equal "task-1", task.id
    assert_equal :queued, task.status
    refute task.finished?
  end

  test "reads a finished task and its images" do
    stub_request(:get, "#{URL}/task-1").to_return(status: 200, body: task_body("COMPLETED", [ "https://cdn.test/out.png" ]))
    task = magnific.task("task-1")
    assert task.completed?
    assert_equal [ "https://cdn.test/out.png" ], task.images
  end

  test "errors say why" do
    { 402 => :quota, 429 => :quota, 400 => :rejected, 500 => :upstream }.each do |status, reason|
      stub_request(:get, "#{URL}/task-1").to_return(status:, body: "{}")
      error = assert_raises(Providers::Magnific::Unavailable) { magnific.task("task-1") }
      assert_equal reason, error.reason, "HTTP #{status}"
    end
    stub_request(:get, "#{URL}/task-1").to_return(status: 200, body: "<html>")
    assert_raises(Providers::Magnific::Unavailable) { magnific.task("task-1") }
    stub_request(:get, "#{URL}/task-1").to_timeout
    assert_equal :upstream, assert_raises(Providers::Magnific::Unavailable) { magnific.task("task-1") }.reason
  end
end

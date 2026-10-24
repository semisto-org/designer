require "test_helper"
require_relative "../test_helpers/offline_site_helper"

class OfflineSiteJobTest < ActiveJob::TestCase
  include OfflineSiteHelper

  setup do
    @site = MapOfflineSite.create!(map: maps(:ahinvaux), requested_by: users(:michael))
  end

  test "builds the zip, attaches it and says what is inside" do
    with_fake_viewer { OfflineSiteJob.perform_now(@site) }
    @site.reload
    assert @site.ready?
    assert_equal "application/zip", @site.archive.content_type
    assert_match(/\Aterranova-domaine-d-ahinvaux-\d{4}-\d{2}-\d{2}\.zip\z/, @site.archive.filename.to_s)
    assert_equal 0, @site.summary["photos"]
    assert @site.finished_at
    entries = zip_entries(StringIO.new(@site.archive.download))
    assert entries.key?("index.html")
  end

  test "a rebuild replaces the previous archive" do
    with_fake_viewer { OfflineSiteJob.perform_now(@site) }
    first = @site.reload.archive.blob
    with_fake_viewer { OfflineSiteJob.perform_now(@site) }
    assert_not_equal first.id, @site.reload.archive.blob.id
  end

  test "a failure is recorded, for the menu to offer another try" do
    previous = OfflineSite::Builder.viewer_dir
    OfflineSite::Builder.viewer_dir = Pathname.new(Dir.mktmpdir)
    OfflineSiteJob.perform_now(@site)
    @site.reload
    assert @site.failed?
    assert_match(/viewer not built/, @site.error)
    assert_not @site.archive.attached?
  ensure
    OfflineSite::Builder.viewer_dir = previous
  end
end

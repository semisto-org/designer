require "test_helper"
require_relative "../test_helpers/billing_test_helper"
require_relative "../test_helpers/soil_photos_helper"

class StorageUsageTest < ActiveSupport::TestCase
  include BillingTestHelper
  include SoilPhotosHelper

  setup { @owner = users(:michael) }

  test "counts the files of every map the payer's plan covers, archived ones included" do
    create_photo
    usage = StorageUsage.new(@owner)
    assert_equal file_fixture("terrain.jpg").size, usage.used_bytes
    maps(:ahinvaux).archive!
    assert_equal file_fixture("terrain.jpg").size, StorageUsage.new(@owner).used_bytes
  end

  test "no limit while billing is off; the plan's limit once it is on" do
    assert_nil StorageUsage.new(@owner).limit_bytes
    with_billing { assert_equal 1.gigabyte, StorageUsage.new(@owner).limit_bytes }
  end

  test "an upload beyond the plan's room is refused, unless Terranova adds the file itself" do
    with_billing do
      # The free plan's gigabyte is all taken.
      create_photo.image.blob.update_column(:byte_size, 1.gigabyte)
      photo = build_photo(salt: 1)
      refute photo.save
      assert_includes photo.errors.full_messages.join, "plus de place"
      assert build_photo(salt: 2).tap { _1.skip_storage_quota = true }.save
    end
  end
end

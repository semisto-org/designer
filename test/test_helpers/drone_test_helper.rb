# Builders for « Vues drone » tests: drone orders and aerial views.
module DroneTestHelper
  PMTILES_URL = "https://drone.example.org/ahinvaux-2027-05-12.pmtiles".freeze
  XYZ_URL = "https://tiles.example.org/ahinvaux/{z}/{x}/{y}.png".freeze

  def drone_order(user, paid_at: Time.current, status: "paid")
    user.plan_purchases.create!(plan_key: "drone", status:, starts_at: paid_at,
                                stripe_checkout_session_id: "cs_drone_#{SecureRandom.hex(4)}")
  end

  def aerial_view(map, **attributes)
    map.aerial_views.create!({ captured_on: Date.new(2027, 5, 12), kind: "pmtiles", url: PMTILES_URL }.merge(attributes))
  end

  # GDAL and pmtiles, which the server image and CI install
  # (AerialViews::Tiler); a laptop without them skips the conversions.
  def skip_without_imagery_tools
    found = ->(tool) { system("command -v #{Shellwords.escape(tool)} > /dev/null 2>&1") }
    skip "gdal-bin and pmtiles are not installed" unless found.("gdal_translate") && found.(AerialViews::Tiler.pmtiles_bin)
  end

  # A view imported from `bytes`, sent in parts as the browser does; `checksum`
  # is what the browser read (nil: the upload is not completed).
  def imported_view(map, user, bytes:, filename: "orthophoto.tif", status: "uploading", checksum: :right, part_size: 64.kilobytes)
    blob = ActiveStorage::Blob.create_before_direct_upload!(filename:, byte_size: bytes.bytesize, checksum: nil,
      content_type: "application/octet-stream", metadata: { composed: true })
    upload = McpUpload.create!(blob:, map:, user:, kind: McpUpload::AERIAL_VIEW, part_size:)
    (1..upload.part_count).each { |n| upload.store_part(n, StringIO.new(bytes.byteslice((n - 1) * part_size, part_size))) }
    blob.update!(checksum: checksum == :right ? Digest::MD5.base64digest(bytes) : checksum) if checksum
    map.aerial_views.create!(name: "Vue drone", captured_on: Date.new(2027, 5, 12), kind: "pmtiles", status:,
      created_by: user, source_upload: upload, source_filename: filename, source_byte_size: bytes.bytesize)
  end
end

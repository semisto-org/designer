# Builders and fixtures shared by the photo and soil tests.
module SoilPhotosHelper
  # A photo of `map` (default: Ahinvaux) with a real JPEG attached. `salt`
  # makes the file's checksum unique (the same photo is refused twice on a map).
  def build_photo(map: maps(:ahinvaux), file: "terrain.jpg", type: "image/jpeg", salt: nil, **attrs)
    photo = map.photos.new(uploaded_by: users(:michael), **attrs)
    photo.image.attach(io: StringIO.new(salted_bytes(file, salt)), filename: file, content_type: type)
    photo
  end

  def create_photo(**attrs) = build_photo(**attrs).tap(&:save!)

  def salted_bytes(file, salt)
    bytes = file_fixture(file).binread
    salt ? bytes + salt.to_s.b : bytes
  end

  # Offset in degrees of longitude for `meters` east at the latitude of the fixtures.
  def meters_east(meters, lat: 50.34) = meters / (111_320.0 * Math.cos(lat * Math::PI / 180))

  def upload(file, type = nil)
    type ||= Marcel::MimeType.for(Pathname.new(file_fixture(file)))
    Rack::Test::UploadedFile.new(file_fixture(file).to_s, type)
  end

  def json_headers = { "Accept" => "application/json" }

  # Runs the block with billing switched on (Stripe configured): the free
  # plan then has no analyses, as in production.
  def with_billing_enabled
    saved = ENV["STRIPE_SECRET_KEY"]
    ENV["STRIPE_SECRET_KEY"] = "sk_test_placeholder"
    yield
  ensure
    saved ? ENV["STRIPE_SECRET_KEY"] = saved : ENV.delete("STRIPE_SECRET_KEY")
  end

  # Runs the block as if every map belonged to an owner on `plan`.
  def with_plan(plan)
    original = Entitlements.method(:for_map)
    Entitlements.define_singleton_method(:for_map) { |_map| Entitlements.new(plan) }
    with_billing_enabled { yield }
  ensure
    Entitlements.define_singleton_method(:for_map, original)
  end

  # Temporarily changes a constant (limits that are too big to test for real).
  def with_constant(owner, name, value)
    original = owner.const_get(name)
    silence_warnings { owner.const_set(name, value) }
    yield
  ensure
    silence_warnings { owner.const_set(name, original) }
  end
end

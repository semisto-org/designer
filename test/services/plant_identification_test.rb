require "test_helper"
require_relative "../test_helpers/plantnet_test_helper"

class PlantIdentificationTest < ActiveSupport::TestCase
  include PlantnetTestHelper

  setup { @provider = Providers::PlantNet.new(api_key: "cle-test") }

  def upload(name, type = nil)
    Rack::Test::UploadedFile.new(file_fixture(name).to_s, type || Marcel::MimeType.for(Pathname.new(file_fixture(name))))
  end

  def identify(*files) = PlantIdentification.new(files:, provider: @provider).run

  test "candidates come back with their score and their catalogue species" do
    stub_plantnet
    result = identify(upload("terrain.jpg"), upload("plant.png"))

    apple, oak = result.candidates
    assert_equal "Malus domestica", apple.latin_name
    assert_equal 83, apple.percent
    assert_equal [ "Pommier", "Pommier domestique" ], apple.common_names
    assert_equal "Rosaceae", apple.family
    assert_equal plant_species(:apple), apple.species

    assert_equal "Quercus robur", oak.latin_name
    assert_equal 7, oak.percent
    assert_nil oak.species
  end

  test "as_json carries what the editor needs, and nothing else about the catalogue" do
    stub_plantnet
    json = identify(upload("terrain.jpg")).candidates.map(&:as_json)

    assert_equal({
      latinName: "Malus domestica", authorship: "(Suckow) Borkh.", commonNames: [ "Pommier", "Pommier domestique" ],
      family: "Rosaceae", score: 0.83, percent: 83,
      species: { id: plant_species(:apple).id, latinName: "Malus domestica", commonName: "Pommier", slug: plant_species(:apple).to_param }
    }, json.first)
    assert_nil json.last[:species]
  end

  test "keeps three common names at most" do
    names = %w[Un Deux Trois Quatre Cinq]
    stub_plantnet(body: plantnet_body(plantnet_result("Quercus robur", 0.5, common_names: names)))
    assert_equal %w[Un Deux Trois], identify(upload("terrain.jpg")).candidates.first.common_names
  end

  test "the photos go to Pl@ntNet with the type read from their bytes" do
    stub_plantnet
    # A PNG that the browser called a JPEG.
    identify(Rack::Test::UploadedFile.new(file_fixture("plant.png").to_s, "image/jpeg"))
    assert_requested(:post, PLANTNET_ENDPOINT) { |request| request.body.include?("Content-Type: image/png") }
  end

  test "nothing is stored" do
    stub_plantnet
    assert_no_difference -> { ActiveStorage::Blob.count } do
      identify(upload("terrain.jpg"))
    end
  end

  test "an empty answer is an empty list" do
    stub_plantnet(status: 404, body: "{}")
    assert_empty identify(upload("terrain.jpg")).candidates
  end

  test "no photo is refused before any call" do
    error = assert_raises(PlantIdentification::Invalid) { identify }
    assert_equal "Choisis au moins une photo de la plante.", error.message
    assert_raises(PlantIdentification::Invalid) { PlantIdentification.new(files: [ nil, "" ], provider: @provider).run }
    assert_not_requested :any, //
  end

  test "more than five photos are refused before any call" do
    error = assert_raises(PlantIdentification::Invalid) { identify(*[ upload("terrain.jpg") ] * 6) }
    assert_equal "5 photos au plus, toutes de la même plante.", error.message
    assert_not_requested :any, //
  end

  test "a file that is not a JPEG or PNG photo is refused" do
    error = assert_raises(PlantIdentification::Invalid) { identify(upload("terrain.kml", "image/jpeg")) }
    assert_equal "«\u00a0terrain.kml\u00a0» n'est pas une photo JPEG ou PNG.", error.message
    assert_raises(PlantIdentification::Invalid) { identify(upload("rapport_labo.pdf")) }
    assert_not_requested :any, //
  end

  test "a photo that is too heavy is refused" do
    heavy = Tempfile.new([ "gros", ".jpg" ], binmode: true)
    heavy.write(file_fixture("terrain.jpg").binread)
    heavy.write("0" * (PlantIdentification::MAX_BYTES + 1))
    heavy.flush
    error = assert_raises(PlantIdentification::Invalid) { identify(Rack::Test::UploadedFile.new(heavy.path, "image/jpeg", original_filename: "gros.jpg")) }
    assert_equal "«\u00a0gros.jpg\u00a0» est trop lourde : 10 Mo au plus.", error.message
    assert_not_requested :any, //
  ensure
    heavy&.close!
  end

  test "an unconfigured provider raises NotConfigured" do
    assert_raises(Providers::PlantNet::NotConfigured) do
      PlantIdentification.new(files: [ upload("terrain.jpg") ], provider: Providers::PlantNet.new(api_key: nil)).run
    end
  end

  test "provider errors go through" do
    stub_plantnet(status: 500, body: "boom")
    assert_raises(Providers::PlantNet::Unavailable) { identify(upload("terrain.jpg")) }
  end
end

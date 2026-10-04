# Builders and ENV switches shared by the Pl@ntNet tests (all HTTP is stubbed).
module PlantnetTestHelper
  PLANTNET_ENDPOINT = %r{\Ahttps://my-api\.plantnet\.org/v2/identify/all}

  # Runs the block with PLANTNET_API_KEY set (and restores it).
  def with_plantnet_key(key = "plantnet-test-key")
    previous = ENV["PLANTNET_API_KEY"]
    ENV["PLANTNET_API_KEY"] = key
    yield
  ensure
    previous ? ENV["PLANTNET_API_KEY"] = previous : ENV.delete("PLANTNET_API_KEY")
  end

  # One result of the Pl@ntNet identify response.
  def plantnet_result(latin_name, score, common_names: [], authorship: nil, genus: nil, family: nil, gbif_id: nil)
    species = { scientificNameWithoutAuthor: latin_name, scientificNameAuthorship: authorship, commonNames: common_names }
    species[:genus] = { scientificNameWithoutAuthor: genus } if genus
    species[:family] = { scientificNameWithoutAuthor: family } if family
    { score:, species:, gbif: gbif_id && { id: gbif_id } }.compact
  end

  def plantnet_body(*results) = { results:, language: "fr" }.to_json

  # Two results as Pl@ntNet sends them: an apple tree (in the test catalogue)
  # and a plant the catalogue does not know.
  def default_plantnet_body
    plantnet_body(
      plantnet_result("Malus domestica", 0.83, common_names: [ "Pommier", "Pommier domestique" ], authorship: "(Suckow) Borkh.",
                      genus: "Malus", family: "Rosaceae", gbif_id: "3001509"),
      plantnet_result("Quercus robur", 0.07, common_names: [], family: "Fagaceae")
    )
  end

  def stub_plantnet(status: 200, body: default_plantnet_body)
    stub_request(:post, PLANTNET_ENDPOINT).to_return(status:, body:, headers: { "Content-Type" => "application/json" })
  end

  def plantnet_image(filename = "feuille.jpg", content_type: "image/jpeg")
    { io: StringIO.new("image-bytes"), filename:, content_type: }
  end
end

# Stubs for the « Règles et risques » providers. The GPU fixtures were
# captured live from API Carto (geometries removed, lists cut); the
# Géorisques one is built from the documented response shape.
module SiteRulesTestHelper
  GPU = "https://apicarto.ign.fr/api/gpu".freeze
  GEORISQUES = %r{\Ahttps://www\.georisques\.gouv\.fr/api/v1/resultats_rapport_risque}

  # Every GPU endpoint answers its part of test/fixtures/files/site_rules/gpu_<place>.json.
  def stub_gpu(place)
    answers = JSON.parse(file_fixture("site_rules/gpu_#{place}.json").read).except("_comment")
    (Providers::Urbanism::Gpu::ESSENTIAL + Providers::Urbanism::Gpu::OPTIONAL).each do |endpoint|
      stub_request(:post, "#{GPU}/#{endpoint}").to_return(status: 200, body: answers.fetch(endpoint).to_json, headers: { "Content-Type" => "application/json" })
    end
  end

  def stub_georisques(body = file_fixture("site_rules/georisques_rapport.json").read, status: 200)
    stub_request(:get, GEORISQUES).to_return(status:, body:, headers: { "Content-Type" => "application/json" })
  end

  def seed_site_rules
    load Rails.root.join("db/seeds/41_site_rules.rb").to_s
    Region.find_each(&:reload)
  end

  def france_map(owner:, boundary: nil, center: [ 4.833, 45.767 ])
    factory = RGeo::Geos.factory(srid: 4326)
    Map.create!(name: "Jardin lyonnais", owner:, region: Region.find_by!(key: "france"),
                center: factory.point(*center), boundary: boundary && factory.parse_wkt(boundary))
  end
end

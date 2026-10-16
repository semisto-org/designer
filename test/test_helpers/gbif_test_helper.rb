# Stubs the GBIF species match API (Providers::Gbif) with WebMock.
module GbifTestHelper
  MATCH = %r{\Ahttps://api\.gbif\.org/v1/species/match}

  # `answers`: { name => GBIF answer }; any other name gets `fallback`.
  def stub_gbif(answers = {}, fallback = { "matchType" => "NONE" })
    stub_request(:get, MATCH).to_return do |request|
      name = Rack::Utils.parse_query(URI(request.uri.to_s).query)["name"]
      { status: 200, body: answers.fetch(name, fallback).to_json, headers: { "Content-Type" => "application/json" } }
    end
  end

  def gbif_accepted(name, key: 1, family: "Lamiaceae", scientific: nil)
    { "usageKey" => key, "scientificName" => scientific || "#{name} L.", "canonicalName" => name.delete("×").squish,
      "rank" => "SPECIES", "status" => "ACCEPTED", "matchType" => "EXACT", "family" => family, "species" => name.delete("×").squish }
  end

  def gbif_synonym(name, accepted, key: 2, accepted_key: 3, family: "Poaceae")
    { "usageKey" => key, "acceptedUsageKey" => accepted_key, "scientificName" => "#{name} Trin.", "canonicalName" => name,
      "rank" => "SPECIES", "status" => "SYNONYM", "matchType" => "EXACT", "family" => family, "species" => accepted }
  end
end

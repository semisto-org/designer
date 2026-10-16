# WebMock stubs for Providers::WikimediaCommons: Wikidata's SPARQL answer and
# Commons' imageinfo, shaped like the real ones.
module WikimediaCommonsTestHelper
  SPARQL = "https://query.wikidata.org/sparql".freeze
  COMMONS = "https://commons.wikimedia.org/w/api.php".freeze

  def stub_wikidata_images(*titles, status: 200)
    bindings = titles.map { |t| { "img" => { "type" => "uri", "value" => "http://commons.wikimedia.org/wiki/Special:FilePath/#{ERB::Util.url_encode(t)}" } } }
    stub_request(:get, SPARQL).with(query: hash_including({}))
      .to_return(status:, body: { "head" => { "vars" => [ "img" ] }, "results" => { "bindings" => bindings } }.to_json,
                 headers: { "Content-Type" => "application/sparql-results+json" })
  end

  def stub_commons_info(title, license: "CC BY-SA 4.0", artist: '<a href="//commons.wikimedia.org/wiki/User:Jean">Jean Dupont</a>', mime: "image/jpeg")
    thumb = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/#{ERB::Util.url_encode(title)}/1600px-#{ERB::Util.url_encode(title)}"
    body = { "batchcomplete" => true, "query" => { "pages" => [ {
      "ns" => 6, "title" => "File:#{title}", "imagerepository" => "local",
      "imageinfo" => [ {
        "thumburl" => thumb, "thumbwidth" => 1600, "thumbheight" => 1200,
        "url" => "https://upload.wikimedia.org/wikipedia/commons/a/ab/#{ERB::Util.url_encode(title)}",
        "descriptionurl" => "https://commons.wikimedia.org/wiki/File:#{ERB::Util.url_encode(title)}",
        "width" => 4000, "height" => 3000, "mime" => mime,
        "extmetadata" => {
          "Artist" => { "value" => artist, "source" => "commons-desc-page" },
          "LicenseShortName" => { "value" => license, "source" => "commons-desc-page" },
          "LicenseUrl" => { "value" => "https://creativecommons.org/licenses/by-sa/4.0", "source" => "commons-desc-page" }
        }
      } ]
    } ] } }
    stub_request(:get, COMMONS).with(query: hash_including("titles" => "File:#{title}")).to_return(status: 200, body: body.to_json)
    thumb
  end

  def stub_commons_download(url)
    stub_request(:get, url).to_return(status: 200, body: file_fixture("plant.png").binread, headers: { "Content-Type" => "image/png" })
  end
end

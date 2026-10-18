# Stubs Jev (Providers::Jev) and the pages it reads (Providers::PlantPages)
# with WebMock.
module JevTestHelper
  JEV = "https://api.typesafe.ai/v1/systemone".freeze

  # `answer`: ->(state, questions) { { id => answer } }, called per request.
  def stub_jev(&answer)
    stub_request(:post, JEV).to_return do |request|
      body = JSON.parse(request.body)
      { status: 200, body: { answers: answer.call(body["state"], body["questions"]) }.to_json,
        headers: { "Content-Type" => "application/json" } }
    end
  end

  # The line id (« S003 ») of the first line of `state` containing `text`.
  def jev_line(state, text)
    state["lines"].lines.find { _1.include?(text) }&.split("|")&.first || "none"
  end

  def stub_pfaf(latin_name, text = nil)
    html = if text
      <<~HTML
        <html><body>
          <span id="ContentPlaceHolder1_lbldisplatinname">#{latin_name}</span>
          <span id="ContentPlaceHolder1_lblPhystatment">#{text}</span>
        </body></html>
      HTML
    else
      "<html><body><span id='ContentPlaceHolder1_lbldisplatinname'></span></body></html>"
    end
    stub_request(:get, %r{\Ahttps://pfaf\.org/user/Plant\.aspx}).to_return(status: 200, body: html)
  end

  def stub_wikipedia(lang, title, extract = nil)
    page = extract ? { "1" => { "title" => title, "extract" => extract } } : { "-1" => { "title" => title, "missing" => "" } }
    stub_request(:get, %r{\Ahttps://#{lang}\.wikipedia\.org/w/api\.php})
      .to_return(status: 200, body: { query: { pages: page } }.to_json, headers: { "Content-Type" => "application/json" })
  end
end

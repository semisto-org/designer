require "test_helper"

# The client document of an offer: blocks and texts from Semisto, the
# template and the offer, filled in for the client; its Word file.
class OfferDocumentTest < ActiveSupport::TestCase
  setup do
    @map = maps(:ahinvaux)
  end

  def offer(inputs = {})
    Offer.build_for(@map).tap { _1.inputs = _1.inputs.merge(inputs) }
  end

  def document_of(source) = Offer::ClientDocument.for(source, map: @map, issuer: "Semisto")

  test "Semisto's blocks come in reading order, filled in for this place" do
    document = document_of(offer)
    keys = document.sections.pluck(:key)
    assert_equal %w[cover approach scope phases software deliverables budget conclusion], keys, "no letter yet, no co-management offered"
    assert_equal "Votre jardin-forêt à #{@map.name}", document.sections.first[:title]
    phases = document.sections.find { _1[:key] == "phases" }[:phases]
    assert_equal %w[pre_design design implementation], phases.pluck(:key)
    assert_includes phases.first[:html], "<strong>Interview et collecte de données</strong>"
  end

  test "the offer overrides the template, which overrides Semisto; a blank falls back" do
    template = OfferTemplate.copy_for(@map.owner, name: "Particulier")
    template.data = template.data.merge("document" => { "blocks" => {
      "software" => { "enabled" => false },
      "conclusion" => { "body" => "À bientôt, {client} !\n\nChristophe — 0472 00 00 00" }
    } })
    template.save!
    built = offer
    built.offer_template = template
    built.inputs = built.inputs.merge("document" => { "letter" => "Bonjour {client},\n\nVotre bois à {lieu}…", "blocks" => {
      "conclusion" => { "title" => "À très vite", "body" => "  " },
      "phases" => { "phases" => { "design" => "Notre design, pour vous." } }
    } })
    document = document_of(built)
    keys = document.sections.pluck(:key)
    assert_equal "letter", keys.second
    assert_not_includes keys, "software", "the template turned it off"
    conclusion = document.sections.find { _1[:key] == "conclusion" }
    assert_equal "À très vite", conclusion[:title]
    assert_match(/À bientôt, Madame, Monsieur !/, conclusion[:markdown], "a blank body keeps the template's, with the placeholder filled in")
    letter = document.sections.find { _1[:key] == "letter" }
    assert_includes letter[:markdown], "Votre bois à #{@map.name}"
    assert_equal "Au plaisir de construire ce projet avec vous,", letter[:closing]
    design = document.sections.find { _1[:key] == "phases" }[:phases].find { _1[:key] == "design" }
    assert_equal "Notre design, pour vous.", design[:markdown]
  end

  test "a phase left out of the offer leaves the document; co-management enters it once offered" do
    document = document_of(offer("phases_off" => %w[implementation], "co_management" => { "enabled" => true, "years" => [ 4 ] }))
    keys = document.sections.pluck(:key)
    assert_includes keys, "co_management"
    assert_equal %w[pre_design design], document.sections.find { _1[:key] == "phases" }[:phases].pluck(:key)
    assert_equal %w[pre_design design co_management], document.sections.find { _1[:key] == "approach" }[:phases].pluck(:key)
  end

  test "only real changes are kept, and raw HTML never reaches the page" do
    normalized = Offer::Document.normalize({ "blocks" => { "cover" => { "title" => " ", "body" => "<script>x</script>Bonjour" }, "nope" => { "body" => "x" } } }, letter: true)
    assert_equal({ "cover" => { "body" => "<script>x</script>Bonjour" } }, normalized["blocks"])
    html = document_of(offer("document" => normalized)).sections.first[:html]
    assert_not_includes html, "<script>"
  end

  test "a saved version keeps its document, whatever the template becomes" do
    built = offer("document" => { "letter" => "Une lettre pour vous, longue et sincère." })
    built.save!
    version = built.save_version!(user: @map.owner)
    built.update!(inputs: built.inputs.merge("document" => { "letter" => "Une autre." }))
    assert_includes document_of(version.reload).letter, "longue et sincère"
  end

  test "the Word file holds every block and the budget" do
    built = offer("document" => { "letter" => "Bonjour **{client}**,\n\n- un\n- deux" })
    export = Offer::DocxExport.new(document_of(built), label: "V1", date: Date.new(2026, 11, 2))
    entries = {}
    Zip::File.open_buffer(StringIO.new(export.to_s)) { |zip| zip.each { entries[_1.name] = _1.get_input_stream.read } }
    assert_equal %w[[Content_Types].xml _rels/.rels word/_rels/document.xml.rels word/document.xml word/numbering.xml word/styles.xml], entries.keys.sort
    xml = entries["word/document.xml"]
    Nokogiri::XML(xml) { _1.strict }
    assert_includes xml, "Votre projet"
    assert_includes xml, "<w:b/>"
    assert_includes xml, %(<w:numId w:val="1"/>)
    assert_includes xml, "Total TVAC"
    assert_match(/\Aoffre-.+-v1\.docx\z/, export.filename)
  end

  test "an offer saved before the newest keys still opens (project management, co-management, document)" do
    built = offer
    built.save!
    old = built.inputs.except("co_management", "document", "supplies", "custom_supplies", "phases_off")
    old["settings"] = old["settings"].except("project_management_pct")
    built.update_column(:inputs, old)
    reloaded = Offer.find(built.id)
    assert_equal 10, reloaded.inputs.dig("settings", "project_management_pct")
    assert reloaded.result["totals"]["total_tvac"].positive?
    assert_equal false, reloaded.inputs.dig("co_management", "enabled")
    assert document_of(reloaded).sections.any?
  end
end

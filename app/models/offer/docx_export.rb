require "zip"

class Offer
  # The client document as a Word file (.docx), for a team that wants to
  # finish it in its own word processor: the same blocks as the page
  # (Offer::ClientDocument), their Markdown turned into Word paragraphs,
  # lists and emphasis, and the budget as a table. Plain WordprocessingML
  # written by hand (a few hundred lines of XML, no gem): headings use
  # Word's own styles, so the team's template can restyle them.
  class DocxExport
    PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

    def initialize(document, label:, date:)
      @document = document
      @label = label
      @date = date
    end

    def filename = "#{I18n.t('offers.document.file_name', map: @document.map.name.parameterize, label: @label.downcase)}.docx"

    def to_s
      buffer = Zip::OutputStream.write_buffer do |zip|
        files.each do |path, xml|
          zip.put_next_entry(path)
          zip.write(xml)
        end
      end
      buffer.string
    end

    def body_xml
      @body_xml ||= @document.sections.each_with_index.map { |section, index| section_xml(section, first: index.zero?) }.join
    end

    private
      def files
        {
          "[Content_Types].xml" => content_types, "_rels/.rels" => root_rels,
          "word/document.xml" => document_xml, "word/styles.xml" => styles_xml,
          "word/numbering.xml" => numbering_xml, "word/_rels/document.xml.rels" => document_rels
        }
      end

      def section_xml(section, first:)
        xml = +""
        xml << PAGE_BREAK unless first
        case section[:key]
        when "cover"
          xml << paragraph(section[:title], style: "Title")
          xml << paragraph(@document.issuer, style: "Subtitle")
          xml << markdown(section[:markdown])
          xml << paragraph(I18n.l(@date, format: :long))
        when "phases"
          section[:phases].each_with_index do |phase, index|
            xml << PAGE_BREAK unless index.zero?
            xml << heading("#{step_mark(phase[:key])} #{step_label(phase[:key])}", 1)
            xml << markdown(phase[:markdown])
          end
        when "scope"
          xml << heading(section[:title], 1) << markdown(section[:markdown]) << scope_xml
        when "budget"
          xml << heading(section[:title], 1) << budget_xml << markdown(section[:markdown]) << terms_xml
        when "letter"
          xml << heading(section[:title], 1) << markdown(section[:markdown]) << markdown(section[:closing])
        else
          xml << heading(section[:title], 1) << markdown(section[:markdown])
          Array(section[:phases]).each do |phase|
            next if phase[:markdown].blank?
            xml << heading("#{step_mark(phase[:key])} #{step_label(phase[:key])}", 2) << markdown(phase[:markdown])
          end
        end
        xml
      end

      def step_label(key) = key == "co_management" ? I18n.t("offers.co_management.title") : I18n.t("offers.phases.#{key}")
      def step_mark(key) = key == "co_management" ? I18n.t("offers.co_management.number") : I18n.t("offers.phase_numbers.#{key}")

      def scope_xml
        items = Array(@document.measures["scope"]).reject { _1["missing"] }
        base, options = items.partition { !_1["option"] }
        xml = base.map { bullet(scope_line(_1)) }.join
        if options.any?
          xml << paragraph(I18n.t("offers.document.scope_options"), bold: true)
          xml << options.map { bullet(scope_line(_1)) }.join
        end
        xml
      end

      def scope_line(item)
        type = I18n.t("offers.planting_types.#{item['planting_type']}", default: item["planting_type"].to_s.humanize)
        measure = item["measure_kind"] == "length" ? "#{number(item['measure'])} m" : "#{number(item['measure'])} m²"
        plants = item["plants_total"].to_i.positive? ? " · #{I18n.t('offers.document.plants_count', count: number(item['plants_total']))}" : ""
        "#{type} · #{measure}#{plants}"
      end

      # Phase by phase, then plants, co-management and the total, TVAC.
      def budget_xml
        result = @document.result
        settings = @document.inputs["settings"].to_h
        rows = []
        phases = Array(result["phases"]).select { _1["enabled"] != false }
        phases.each do |phase|
          rows << [ "#{step_mark(phase['key'])} #{step_label(phase['key'])}", phase["price_tvac"], nil, true ]
          rows << [ I18n.t("offers.version_page.fees"), phase.dig("prices", "fees"), vat(settings["vat_services_pct"]) ]
          rows << [ I18n.t("offers.version_page.expenses"), phase.dig("prices", "expenses"), vat(settings["vat_services_pct"]) ] if phase.dig("prices", "expenses").to_f.positive?
        end
        plants = result["plants"].to_h
        if result.dig("totals", "planting_included") != false && plants["count_base"].to_i.positive?
          rows << [ I18n.t("offers.version_page.plants", count: number(plants["count_base"])), plants["plants_base_tvac"], vat(settings["vat_plants_pct"]) ]
          rows << [ I18n.t("offers.version_page.supplies"), plants["supplies_base_tvac"], vat(settings["vat_supplies_pct"]) ]
        end
        co = result["co_management"].to_h
        if co["enabled"]
          rows << [ "#{step_mark('co_management')} #{step_label('co_management')}", co["amount_tvac"], nil, true ]
          Array(co["years"]).each do |year|
            rows << [ I18n.t("offers.version_page.co_management_year", year: year["year"], half_days: number(year["half_days"])), year["amount_tvac"], vat(settings["vat_services_pct"]) ]
          end
        end
        rows << [ I18n.t("offers.version_page.total"), result.dig("totals", "total_tvac"), nil, true ]
        xml = table(rows)
        max = result.dig("totals", "total_max_tvac").to_f
        xml << paragraph(I18n.t("offers.version_page.total_max", amount: euros(max))) if max > result.dig("totals", "total_tvac").to_f
        xml << paragraph(I18n.t("offers.version_page.billing"))
        xml
      end

      # Billing in régie after each step, then what keeps the work within its price.
      def terms_xml
        terms = @document.terms.to_h
        rate = @document.inputs.dig("settings", "hourly_rate")
        xml = paragraph(I18n.t("offers.version_page.regie_title"), bold: true)
        xml << paragraph(I18n.t("offers.version_page.regie", rate: euros(rate), rate_tvac: euros(@document.result["regie_rate_tvac"])))
        facts = [
          (I18n.t("offers.version_page.revisions", count: terms["revisions"]) if terms["revisions"]),
          (I18n.t("offers.version_page.validity", days: terms["validity_days"]) if terms["validity_days"]),
          (I18n.t("offers.version_page.deposit", pct: number(terms["deposit_pct"])) if terms["deposit_pct"].to_f.positive?)
        ].compact
        return xml if facts.empty? && terms["assumptions"].blank? && terms["exclusions"].blank?
        xml << paragraph(I18n.t("offers.version_page.terms_title"), bold: true)
        xml << facts.map { bullet(_1) }.join
        xml << paragraph("#{I18n.t('offers.version_page.assumptions')} #{terms['assumptions']}") if terms["assumptions"].present?
        xml << paragraph("#{I18n.t('offers.version_page.exclusions')} #{terms['exclusions']}") if terms["exclusions"].present?
        xml
      end

      def vat(pct) = I18n.t("offers.version_page.vat", pct: number(pct))
      def number(value) = ActiveSupport::NumberHelper.number_to_delimited(value.to_f.round(value.to_f % 1 == 0 ? 0 : 1).then { _1 % 1 == 0 ? _1.to_i : _1 }, delimiter: " ", separator: ",")
      def euros(value) = "#{number(value.to_f.round)} €"

      def table(rows)
        cells = rows.map do |label, amount, hint, strong|
          "<w:tr>#{cell(label, strong:, width: 5600)}#{cell(hint.to_s, width: 1800)}#{cell(euros(amount), strong:, width: 1800, right: true)}</w:tr>"
        end
        borders = %w[top bottom insideH].map { %(<w:#{_1} w:val="single" w:sz="4" w:space="0" w:color="D8CFC4"/>) }.join
        %(<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:tblBorders>#{borders}</w:tblBorders></w:tblPr>) +
          %(<w:tblGrid><w:gridCol w:w="5600"/><w:gridCol w:w="1800"/><w:gridCol w:w="1800"/></w:tblGrid>#{cells.join}</w:tbl>) +
          paragraph("")
      end

      def cell(text, width:, strong: false, right: false)
        align = right ? '<w:jc w:val="right"/>' : ""
        %(<w:tc><w:tcPr><w:tcW w:w="#{width}" w:type="dxa"/></w:tcPr><w:p><w:pPr>#{align}</w:pPr>#{run(text, bold: strong)}</w:p></w:tc>)
      end

      def heading(text, level) = paragraph(text, style: "Heading#{level}")

      def paragraph(text, style: nil, bold: false)
        props = style ? %(<w:pPr><w:pStyle w:val="#{style}"/></w:pPr>) : ""
        "<w:p>#{props}#{run(text, bold:)}</w:p>"
      end

      def bullet(text) = %(<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>#{run(text)}</w:p>)

      def run(text, bold: false, italic: false)
        props = [ ("<w:b/>" if bold), ("<w:i/>" if italic) ].compact.join
        props = "<w:rPr>#{props}</w:rPr>" if props.present?
        %(<w:r>#{props}<w:t xml:space="preserve">#{escape(text)}</w:t></w:r>)
      end

      def escape(text) = ERB::Util.html_escape(text.to_s)

      # Markdown → paragraphs: headings, paragraphs, bullet and numbered
      # lists (one level, as the texts are written), bold, italics, links as
      # their text. Anything else is read as its text.
      def markdown(text)
        return "" if text.blank?
        doc = Commonmarker.parse(text, options: { parse: { smart: true } })
        blocks(doc)
      end

      def blocks(node, list: nil)
        node.each.map do |child|
          case child.type
          when :paragraph then list ? list_paragraph(child, list) : "<w:p>#{inline(child)}</w:p>"
          when :heading then %(<w:p><w:pPr><w:pStyle w:val="Heading#{[ child.header_level + 1, 3 ].min}"/></w:pPr>#{inline(child)}</w:p>)
          when :list then blocks(child, list: child.list_type == :ordered ? 2 : 1)
          when :item then blocks(child, list:)
          when :block_quote, :html_block then blocks(child)
          when :thematic_break then ""
          when :code_block then "<w:p>#{run(child.string_content)}</w:p>"
          else "<w:p>#{inline(child)}</w:p>"
          end
        end.join
      end

      def list_paragraph(node, num_id)
        %(<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="#{num_id}"/></w:numPr></w:pPr>#{inline(node)}</w:p>)
      end

      def inline(node, bold: false, italic: false)
        node.each.map do |child|
          case child.type
          when :text then run(child.string_content, bold:, italic:)
          when :strong then inline(child, bold: true, italic:)
          when :emph then inline(child, bold:, italic: true)
          when :code then run(child.string_content, bold:, italic:)
          when :softbreak then run(" ", bold:, italic:)
          when :linebreak then "<w:r><w:br/></w:r>"
          else inline(child, bold:, italic:)
          end
        end.join
      end

      def document_xml
        <<~XML
          <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <w:body>#{body_xml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body>
          </w:document>
        XML
      end

      def styles_xml
        font = %(<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>)
        serif = %(<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>)
        style = ->(id, name, rpr, ppr = "") { %(<w:style w:type="paragraph" w:styleId="#{id}"><w:name w:val="#{name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr>#{ppr}</w:pPr><w:rPr>#{rpr}</w:rPr></w:style>) }
        <<~XML
          <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:docDefaults><w:rPrDefault><w:rPr>#{font}<w:sz w:val="22"/><w:lang w:val="fr-BE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
          <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
          #{style.('Title', 'Title', "#{serif}<w:color w:val=\"5B2C4F\"/><w:sz w:val=\"56\"/>", '<w:spacing w:before="2400" w:after="240"/>')}
          #{style.('Subtitle', 'Subtitle', '<w:color w:val="6B5E52"/><w:sz w:val="28"/>')}
          #{style.('Heading1', 'heading 1', "#{serif}<w:b/><w:color w:val=\"5B2C4F\"/><w:sz w:val=\"36\"/>", '<w:keepNext/><w:spacing w:before="240" w:after="160"/><w:outlineLvl w:val="0"/>')}
          #{style.('Heading2', 'heading 2', '<w:b/><w:color w:val="3F5A2E"/><w:sz w:val="26"/>', '<w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/>')}
          #{style.('Heading3', 'heading 3', '<w:b/><w:sz w:val="22"/>', '<w:keepNext/><w:outlineLvl w:val="2"/>')}
          #{style.('ListParagraph', 'List Paragraph', '', '<w:spacing w:after="60"/><w:ind w:left="720"/>')}
          </w:styles>
        XML
      end

      def numbering_xml
        level = ->(format, text) { %(<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="#{format}"/><w:lvlText w:val="#{text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>) }
        <<~XML
          <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:abstractNum w:abstractNumId="0">#{level.('bullet', '•')}</w:abstractNum>
          <w:abstractNum w:abstractNumId="1">#{level.('decimal', '%1.')}</w:abstractNum>
          <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
          <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
          </w:numbering>
        XML
      end

      def content_types
        <<~XML
          <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
          <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
          <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
          </Types>
        XML
      end

      def root_rels
        <<~XML
          <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
          </Relationships>
        XML
      end

      def document_rels
        <<~XML
          <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
          </Relationships>
        XML
      end
  end
end

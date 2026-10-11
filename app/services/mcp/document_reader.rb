require "zip"

module Mcp
  # What a document of a map's library says, for an AI: the text of a PDF,
  # of a word-processor file or of a plain-text file, or the image itself to
  # look at. Anything else (spreadsheets, drawings, archives) says why it
  # cannot be read here, so the AI sends the person to the library.
  class DocumentReader
    MAX_SOURCE_BYTES = 25.megabytes
    MAX_IMAGE_SIDE = 1568
    TEXT_EXTENSIONS = %w[txt md csv geojson kml gpx].freeze
    WORD_XML = { "docx" => [ "word/document.xml", "//w:p" ], "odt" => [ "content.xml", "//text:p | //text:h" ] }.freeze

    # format: "text", "image" or "unreadable" (then `reason` says why).
    Result = Data.define(:format, :text, :image, :pages, :reason) do
      def self.unreadable(reason) = new(format: "unreadable", text: nil, image: nil, pages: nil, reason:)
    end

    # Whether the reader knows the document's kind of file (before reading it).
    def self.readable?(document)
      ext = document.extension
      ext == "pdf" || TEXT_EXTENSIONS.include?(ext) || WORD_XML.key?(ext) || document.kind == "image"
    end

    def initialize(document)
      @document = document
    end

    def call
      return Result.unreadable("format") unless self.class.readable?(@document)
      return Result.unreadable("too_large") if @document.file.blob.byte_size > MAX_SOURCE_BYTES
      return image if @document.kind == "image"
      data = @document.file.download
      case @document.extension
      when "pdf" then pdf(data)
      when *WORD_XML.keys then word(data)
      else text_result(utf8(data))
      end
    rescue StandardError => e
      Rails.logger.warn("[mcp] document #{@document.id} unreadable: #{e.class}: #{e.message}")
      Result.unreadable("broken")
    end

    private
      def pdf(data)
        reader = PDF::Reader.new(StringIO.new(data))
        pages = reader.pages.map { |page| page.text.to_s.gsub(/[ \t]+$/, "").strip }
        text = pages.each_with_index.map { |page, i| "--- page #{i + 1} ---\n#{page}" }.join("\n\n")
        # A scan has pages but no text layer.
        return Result.unreadable("scanned") if pages.all?(&:blank?)
        Result.new(format: "text", text: utf8(text), image: nil, pages: pages.size, reason: nil)
      rescue PDF::Reader::EncryptedPDFError
        Result.unreadable("encrypted")
      end

      def word(data)
        entry, paragraphs = WORD_XML.fetch(@document.extension)
        found = Zip::File.open_buffer(StringIO.new(data)).find_entry(entry)
        return Result.unreadable("broken") unless found
        # The size the archive announces, so a tiny file cannot unpack into gigabytes.
        return Result.unreadable("too_large") if found.size > MAX_SOURCE_BYTES
        xml = found.get_input_stream.read(MAX_SOURCE_BYTES)
        doc = Nokogiri::XML(xml)
        text_result(doc.xpath(paragraphs, doc.root.namespaces).map { _1.text.strip }.join("\n"))
      end

      def image
        bytes = @document.file.variant(resize_to_limit: [ MAX_IMAGE_SIDE, MAX_IMAGE_SIDE ], format: :jpeg, saver: { strip: true, quality: 85 }).processed.download
        Result.new(format: "image", text: nil, image: bytes, pages: nil, reason: nil)
      end

      def text_result(text)
        return Result.unreadable("empty") if text.blank?
        Result.new(format: "text", text:, image: nil, pages: nil, reason: nil)
      end

      # UTF-8 as is; anything else is taken for Windows-1252 (a CSV saved
      # by a spreadsheet, a .txt from an old Windows).
      def utf8(data)
        text = data.dup.force_encoding(Encoding::UTF_8)
        text = data.dup.force_encoding(Encoding::Windows_1252).encode(Encoding::UTF_8, invalid: :replace, undef: :replace, replace: "") unless text.valid_encoding?
        text.delete_prefix("\uFEFF")
      end
  end
end

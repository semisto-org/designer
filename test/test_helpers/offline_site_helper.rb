require "zip"

# The offline site's viewer is built by npm (public/offline-viewer): tests
# point the builder at two stand-in files instead.
module OfflineSiteHelper
  def with_fake_viewer
    Dir.mktmpdir do |dir|
      File.write(File.join(dir, "terranova.js"), "/* viewer */")
      File.write(File.join(dir, "terranova.css"), "/* styles */")
      previous = OfflineSite::Builder.viewer_dir
      OfflineSite::Builder.viewer_dir = Pathname.new(dir)
      yield
    ensure
      OfflineSite::Builder.viewer_dir = previous
    end
  end

  # { "path inside the folder" => content } of a zip's entries.
  def zip_entries(io)
    io.rewind
    entries = {}
    Zip::InputStream.open(io) do |zip|
      while (entry = zip.get_next_entry)
        content = zip.read
        utf8 = content.dup.force_encoding(Encoding::UTF_8)
        entries[entry.name.dup.force_encoding(Encoding::UTF_8).split("/", 2).last] = utf8.valid_encoding? ? utf8 : content
      end
    end
    entries
  end

  # The viewer's data, read back from donnees/carte.js.
  def offline_data(entries)
    JSON.parse(entries.fetch("donnees/carte.js")[/\Awindow\.TERRANOVA_OFFLINE = (.*);\n\z/m, 1])
  end
end

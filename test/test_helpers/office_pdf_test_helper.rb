# LibreOffice for the PDF conversion tests: none at all, or a stand-in that
# answers like `soffice --convert-to pdf` (or fails, or hangs) in an instant.
module OfficePdfTestHelper
  def without_libreoffice(&) = with_office_binary(nil, &)

  # mode: "ok" writes a small PDF where soffice would; "fail" exits 1; "hang" sleeps.
  def with_fake_libreoffice(mode = "ok", &)
    dir = Dir.mktmpdir("fake-soffice")
    script = File.join(dir, "soffice")
    pdf = file_fixture("rapport_labo.pdf").to_s
    File.write(script, <<~SH)
      #!/bin/sh
      case "#{mode}" in fail) exit 1 ;; hang) sleep 30 ;; esac
      for arg; do last="$arg"; done
      while [ $# -gt 0 ]; do [ "$1" = "--outdir" ] && out="$2"; shift; done
      mkdir -p "$out"
      name=$(basename "$last"); cp "#{pdf}" "$out/${name%.*}.pdf"
    SH
    File.chmod(0o755, script)
    with_office_binary(script, &)
  ensure
    FileUtils.rm_rf(dir) if dir
  end

  def attach_docx(map, user: users(:michael), **attrs)
    doc = map.documents.new(uploaded_by: user, **attrs)
    doc.file.attach(io: file_fixture("plan_de_plantation.docx").open, filename: "plan_de_plantation.docx",
      content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    doc.save!
    doc
  end

  private
    def with_office_binary(path)
      OfficePdf.binary
      found = OfficePdf.instance_variable_get(:@binary)
      OfficePdf.instance_variable_set(:@binary, path)
      yield
    ensure
      OfficePdf.instance_variable_set(:@binary, found)
    end
end

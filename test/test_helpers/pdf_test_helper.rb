# A heavy PDF for compression tests: one page holding a raw (uncompressed)
# RGB gradient, which Ghostscript shrinks to a fraction of its size.
module PdfTestHelper
  def heavy_pdf(side: 800)
    pixels = String.new(capacity: side * side * 3, encoding: Encoding::BINARY)
    side.times { |y| side.times { |x| pixels << [ x * 255 / side, y * 255 / side, 128 ].pack("C3") } }
    content = "q #{side} 0 0 #{side} 0 0 cm /Im1 Do Q"
    objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 #{side} #{side}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /XObject /Subtype /Image /Width #{side} /Height #{side} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length #{pixels.bytesize} >>\nstream\n".b + pixels + "\nendstream".b,
      "<< /Length #{content.bytesize} >>\nstream\n#{content}\nendstream"
    ]
    pdf = "%PDF-1.4\n".b
    offsets = objects.each_with_index.map do |body, index|
      offset = pdf.bytesize
      pdf << "#{index + 1} 0 obj\n".b << body.b << "\nendobj\n".b
      offset
    end
    xref = pdf.bytesize
    pdf << "xref\n0 #{objects.size + 1}\n0000000000 65535 f \n".b
    offsets.each { |offset| pdf << format("%010d 00000 n \n", offset).b }
    pdf << "trailer\n<< /Size #{objects.size + 1} /Root 1 0 R >>\nstartxref\n#{xref}\n%%EOF\n".b
    pdf
  end

  def without_ghostscript
    PdfCompressor.binary
    found = PdfCompressor.instance_variable_get(:@binary)
    PdfCompressor.instance_variable_set(:@binary, nil)
    yield
  ensure
    PdfCompressor.instance_variable_set(:@binary, found)
  end
end

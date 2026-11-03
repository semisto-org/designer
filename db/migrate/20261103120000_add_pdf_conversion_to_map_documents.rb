# A word-processor document (.docx, .doc, .odt, .rtf) of a map's library can
# be turned into a PDF (ConvertMapDocumentToPdfJob, LibreOffice): the PDF is a
# new document that remembers where it came from (`converted_from`), and the
# source says while the conversion runs or why it failed (`pdf_conversion`).
class AddPdfConversionToMapDocuments < ActiveRecord::Migration[8.1]
  def change
    add_column :map_documents, :pdf_conversion, :string
    add_reference :map_documents, :converted_from, foreign_key: { to_table: :map_documents, on_delete: :nullify }
  end
end

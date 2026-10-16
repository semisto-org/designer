# One Yjs update of a Markdown document written together (MapDocumentChannel).
# The server never reads them: it keeps them in order and hands them to
# whoever joins, who merges them in the browser.
class MapDocumentCollabUpdate < ApplicationRecord
  MAX_BYTES = 512.kilobytes

  belongs_to :map_document

  validates :data, presence: true
  validate { errors.add(:data, :too_long, count: MAX_BYTES) if data.to_s.bytesize > MAX_BYTES }
end

# A Markdown document written by several people at once. Editors send their
# Yjs edits (`update`), kept in order (MapDocumentCollabUpdate) and relayed
# to the others, and where their cursor is (`awareness`, relayed only).
# Readers listen too: a « saved » message tells them the page changed, a
# « reset » that it was rewritten from elsewhere (the MCP) and the shared
# editing starts again from the new text (a new epoch). Each relayed
# message names the browser tab it came from (`from`), which ignores its echo.
class MapDocumentChannel < ApplicationCable::Channel
  def subscribed
    @document = MapDocument.includes(:map).find_by(id: params[:document_id])
    map = @document&.map
    return reject unless map && !map.archived_at && map.viewable_by?(current_user) && @document.editable_markdown?
    @editor = map.editable_by?(current_user) && !map.read_only_by_plan?
    stream_for @document
  end

  def update(data)
    return unless @editor
    bytes = Base64.strict_decode64(data["update"].to_s)
    if @document.add_collab_update!(bytes, epoch: Integer(data["epoch"]))
      relay("update", data["update"], epoch: @document.collab_epoch)
    else
      # The text was replaced meanwhile: this tab starts again from it.
      transmit({ type: "reset", epoch: @document.collab_epoch })
    end
  rescue ArgumentError, TypeError, ActiveRecord::RecordInvalid
    transmit({ type: "error" })
  end

  def awareness(data)
    relay("awareness", data["update"]) if @editor
  end

  # Someone opened the document: the others say who they are and where they write.
  def hello(_data = {})
    relay("hello", nil) if @editor
  end

  def compact(data)
    return unless @editor
    @document.compact_collab!(Base64.strict_decode64(data["update"].to_s), last_id: Integer(data["last_id"]), epoch: Integer(data["epoch"]))
  rescue ArgumentError, TypeError, ActiveRecord::RecordInvalid
    nil
  end

  private
    def relay(type, payload, **extra)
      MapDocumentChannel.broadcast_to(@document, { type:, update: payload, from: params[:client].to_s.first(64), **extra })
    end
end

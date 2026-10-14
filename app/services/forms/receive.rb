module Forms
  # Keeps one answer posted to a team's FormInbox, once (Tally may deliver
  # the same response twice), and files it in its map when the hidden field
  # names one of the team's maps. Returns the FormResponse, or nil when the
  # event is not an answer.
  class Receive
    def initialize(inbox, event)
      @inbox = inbox
      @payload = TallyPayload.new(event)
    end

    def call
      return nil unless @payload.response?
      form = find_form
      existing = form.responses.find_by(external_id: @payload.response_id)
      return existing if existing

      response = form.responses.create!(
        external_id: @payload.response_id, submitted_at: @payload.submitted_at,
        map_reference: @payload.map_reference, fields: @payload.fields.map(&:to_h)
      )
      map = find_map
      response.file_in!(map) if map
      response
    rescue ActiveRecord::RecordNotUnique
      form.responses.find_by!(external_id: @payload.response_id)
    end

    private
      def find_form
        form = @inbox.forms.find_or_initialize_by(provider: "tally", external_id: @payload.form_id)
        # Tally's own name wins: it is what the team sees in Tally.
        form.name = @payload.form_name if form.new_record? || @payload.form_name != @payload.form_id
        form.save! if form.changed?
        form
      end

      def find_map
        id = @payload.map_reference
        id.to_s.match?(/\A\d{1,12}\z/) ? @inbox.maps.find_by(id:) : nil
      end
  end
end

module Teams
  # What the team's « Formulaires » page shows: the webhook address and its
  # secret (admins only), the team's forms, the answers received (newest
  # first, those to file on top) and the team's maps to file them in.
  class FormsPayload
    RESPONSES_LIMIT = 100

    def initialize(team, user)
      @team = team
      @admin = team.admin?(user)
      @inbox = team.form_inbox
    end

    def as_json(*)
      {
        team: { id: @team.id, name: @team.name, admin: @admin },
        inbox: inbox,
        forms: forms,
        responses: responses,
        maps: @inbox ? @inbox.maps.order(:name).map { { id: _1.id, name: _1.name } } : [],
        mapField: FormResponse::MAP_FIELD
      }
    end

    private
      def inbox
        return nil unless @inbox
        data = { connected: true }
        data.merge!(url: webhook_url, secret: @inbox.signing_secret) if @admin
        data
      end

      def webhook_url
        options = Rails.application.config.action_mailer.default_url_options || {}
        Rails.application.routes.url_helpers.tally_webhook_url(@inbox.token, **options)
      end

      def forms
        return [] unless @inbox
        counts = FormResponse.where(form: @inbox.forms).group(:external_form_id).count
        @inbox.forms.by_name.map do |form|
          { id: form.id, name: form.name, url: form.url, externalId: form.external_id, responsesCount: counts.fetch(form.id, 0) }
        end
      end

      def responses
        return [] unless @inbox
        FormResponse.where(form: @inbox.forms).includes(:form, :map, :map_document)
          .order(Arel.sql("form_responses.map_id IS NULL DESC"), submitted_at: :desc, id: :desc)
          .limit(RESPONSES_LIMIT)
          .map do |response|
            response.as_inertia.merge(
              mapId: response.map_id, mapName: response.map&.name, mapReference: response.map_reference,
              documentId: response.map_document_id
            )
          end
      end
  end
end

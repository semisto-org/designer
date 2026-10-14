# A team map's « Formulaires » view: the team's Tally forms, each with the
# link that files the answer in this map (for editors, who send them), and
# the answers this map received, which everyone on the map reads.
module Maps
  class FormsController < ApplicationController
    include MapScoped

    before_action :set_map

    def index
      team = @map.organization
      inbox = team&.form_inbox
      render inertia: "maps/forms/index", props: {
        map: { id: @map.id, name: @map.name, role: @role, teamId: @map.organization_id },
        team: team && { id: team.id, name: team.name, admin: team.admin?(Current.user) },
        connected: inbox.present?,
        canEdit: editor?,
        forms: editor? && inbox ? forms_json(inbox) : [],
        responses: responses_json
      }
    end

    private
      def editor? = %w[owner editor].include?(@role)

      def answers = FormResponse.where(map: @map)

      def forms_json(inbox)
        counts = answers.group(:external_form_id).count
        inbox.forms.by_name.map do |form|
          { id: form.id, name: form.name, url: form.url, link: form.link_for(@map), responsesCount: counts.fetch(form.id, 0) }
        end
      end

      def responses_json
        answers.newest_first.includes(:form).map { _1.as_inertia.merge(documentId: _1.map_document_id) }
      end
  end
end

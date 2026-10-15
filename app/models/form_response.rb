# One answer to a team's form (ExternalForm), as Tally sent it: the
# questions and answers in `fields` ([{ "label", "value" }], plain text, see
# Forms::TallyPayload). With a map it is filed in the map's documents as a
# Markdown sheet (`map_document`), which the library shows and the MCP reads.
# Without one (the link had no map, or a map outside the team) it waits in
# the team's « À rattacher » list until someone files it.
class FormResponse < ApplicationRecord
  # The hidden field of the form that carries the map's id.
  MAP_FIELDS = %w[carte map map_id].freeze
  MAP_FIELD = MAP_FIELDS.first

  belongs_to :form, class_name: "ExternalForm", foreign_key: :external_form_id
  belongs_to :map, optional: true
  belongs_to :map_document, optional: true

  validates :external_id, presence: true, uniqueness: { scope: :external_form_id }
  validates :submitted_at, presence: true
  validate :map_belongs_to_team

  scope :newest_first, -> { order(submitted_at: :desc, id: :desc) }
  scope :unfiled, -> { where(map_id: nil) }

  # Files the answer in `map`'s documents (once: a second call only moves
  # the document if the map changed).
  def file_in!(map)
    transaction do
      update!(map:)
      document = map_document if map_document&.map_id == map.id
      document ||= map.documents.create!(
        title: document_title, tags: [ form.name ], origin: "form",
        file: { io: StringIO.new(to_markdown), filename: "#{form.name.parameterize.presence || "formulaire"}-#{submitted_at.to_date.iso8601}.md", content_type: "text/markdown" }
      )
      map_document&.destroy! if map_document && map_document != document
      update!(map_document: document)
    end
  end

  def document_title
    I18n.t("forms.document.title", form: form.name, date: I18n.l(submitted_at.to_date, format: :long)).first(200)
  end

  def to_markdown
    lines = [ "# #{form.name}", "", I18n.t("forms.document.received", date: I18n.l(submitted_at.in_time_zone("Europe/Brussels"), format: :long)), "" ]
    fields.each do |field|
      lines << "## #{field["label"]}" << "" << field["value"].to_s << ""
    end
    lines.join("\n")
  end

  # For the library's viewer and the team's list.
  def as_inertia
    { id:, formName: form.name, submittedAt: submitted_at.iso8601, fields: fields.map { { label: _1["label"], value: _1["value"] } } }
  end

  private
    def map_belongs_to_team
      return if map.nil? || map.organization_id == form&.inbox&.organization_id
      errors.add(:map, :invalid)
    end
end

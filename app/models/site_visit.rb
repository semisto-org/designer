# A walk on the land with the phone (« visite de terrain »). On the way the
# person notes what they see where they stand, each note sorted by theme in
# one gesture: the owner's wishes, water, soil, a tree already there… These
# are the themes Semisto's designers write down on every first visit. A note
# is a note point of the map (layer notes, kind note_point) whose properties
# carry the visit's `key` and its `theme`; the phone makes the key, so notes
# taken without network join their visit once they reach the server.
#
# Closing the visit files its report in the map's documents, as a Markdown
# page grouped by theme (`report_markdown`), and turns the questions one
# chose into tasks about their note. The report is then the visit's: closing
# again never rewrites what someone has edited since.
class SiteVisit < ApplicationRecord
  THEMES = %w[wish water soil tree fauna climate neighbours history question].freeze
  NOTE_LAYER = "notes"
  NOTE_KIND = "note_point"
  KEY_FORMAT = /\A[0-9A-Za-z-]{8,64}\z/
  # Where the questions turned into tasks go (TaskList#key).
  TASK_LIST_KEY = "site_visits"

  belongs_to :map
  belongs_to :user, optional: true
  belongs_to :map_document, optional: true

  validates :key, format: { with: KEY_FORMAT }, uniqueness: { scope: :map_id }
  validates :started_at, presence: true
  validate :ends_after_it_starts

  scope :chronological, -> { order(:started_at, :id) }

  # The visit a note just created belongs to, made on its first note. An
  # earlier note (sent late from another phone) moves the start back.
  def self.for_note!(feature, by:)
    key = feature.properties.is_a?(Hash) ? feature.properties["visit"].to_s : ""
    return unless feature.layer == NOTE_LAYER && key.match?(KEY_FORMAT)
    at = taken_at(feature)
    visit = feature.map.site_visits.create_with(user: by, started_at: at).find_or_create_by!(key:)
    visit.update!(started_at: at) if at < visit.started_at
    visit
  rescue ActiveRecord::RecordNotUnique
    retry
  end

  def notes
    map.features.where(layer: NOTE_LAYER, kind: NOTE_KIND).where("properties->>'visit' = ?", key)
      .to_a.sort_by { |note| [ self.class.taken_at(note), note.id ] }
  end

  # When the note was taken: the phone says so (`taken_at`), since a note
  # taken without network reaches the server later; never in the future.
  def self.taken_at(note)
    said = Time.zone.parse(note.properties["taken_at"].to_s) if note.properties.is_a?(Hash) && note.properties["taken_at"].present?
    [ said || note.created_at || Time.current, note.created_at || Time.current ].min
  rescue ArgumentError
    note.created_at || Time.current
  end

  def closed? = ended_at.present?

  # Ends the visit: its report in the documents (made once), and a task for
  # each question in `question_ids` that has none yet.
  def close!(ended_at:, by:, started_at: nil, question_ids: [])
    transaction do
      self.started_at = [ self.started_at, started_at ].compact.min if started_at
      self.ended_at = [ ended_at, self.started_at ].compact.max
      save!
      turn_into_tasks!(question_ids, by:)
      file_report!(by:) unless map_document
    end
    self
  end

  def title
    I18n.t("site_visits.report.title", date: I18n.l(started_at.to_date, format: :long))
  end

  # The report as Markdown: who walked and when, then the notes by theme in
  # the order of THEMES (questions last, as a checklist), then the others.
  def report_markdown(notes = self.notes)
    photos = MapPhoto.where(map_feature_id: notes.map(&:id)).group(:map_feature_id).count
    by_theme = notes.group_by { |note| THEMES.include?(theme_of(note)) ? theme_of(note) : "other" }
    lines = [ "# #{title}", "", summary_line(notes, photos.values.sum), "" ]
    (THEMES + [ "other" ]).each do |theme|
      next if by_theme[theme].blank?
      lines << "## #{I18n.t("site_visits.themes.#{theme}")}" << ""
      by_theme[theme].each { |note| lines << note_line(note, photos[note.id].to_i, question: theme == "question") }
      lines << ""
    end
    lines << I18n.t("site_visits.report.empty") << "" if notes.empty?
    lines.join("\n")
  end

  def as_json(*)
    {
      key:, startedAt: started_at.iso8601, endedAt: ended_at&.iso8601, by: user&.display_name,
      notes: notes.size, documentId: map_document_id
    }.compact
  end

  private
    def theme_of(note) = note.properties.is_a?(Hash) ? note.properties["theme"].to_s : ""

    def text_of(note) = [ note.name, note.notes ].compact_blank.uniq.join(" — ").presence || I18n.t("site_visits.report.no_text")

    def summary_line(notes, photo_count)
      parts = [ user&.display_name, time_range ].compact
      parts << I18n.t("site_visits.report.notes", count: notes.size)
      parts << I18n.t("site_visits.report.photos", count: photo_count) if photo_count.positive?
      parts.join(" · ")
    end

    def time_range
      from = I18n.l(started_at, format: :site_visit_hour)
      return from unless ended_at && ended_at.to_date == started_at.to_date && ended_at > started_at
      I18n.t("site_visits.report.range", from:, to: I18n.l(ended_at, format: :site_visit_hour))
    end

    def note_line(note, photo_count, question:)
      text = text_of(note).gsub(/\s+/, " ")
      text += " #{I18n.t("site_visits.report.note_photos", count: photo_count)}" if photo_count.positive?
      prefix = question ? "- [ ]" : "-"
      "#{prefix} #{I18n.l(self.class.taken_at(note), format: :site_visit_hour)} · #{text}"
    end

    def file_report!(by:)
      document = MapDocument.build_markdown(map:, title:, content: report_markdown, by:, tags: [ I18n.t("site_visits.report.tag") ])
      document.save!
      update!(map_document: document)
    end

    def turn_into_tasks!(question_ids, by:)
      ids = Array(question_ids).map(&:to_i).uniq
      return if ids.empty?
      questions = notes.select { |note| ids.include?(note.id) && theme_of(note) == "question" }
      questions.reject! { |note| TaskFeature.exists?(map_feature_id: note.id) }
      return if questions.empty?
      list = map.task_lists.find_by(key: TASK_LIST_KEY) ||
        map.task_lists.create!(key: TASK_LIST_KEY, name: I18n.t("site_visits.task_list"), created_by: by)
      questions.each do |note|
        list.tasks.create!(
          map:, title: text_of(note).gsub(/\s+/, " ").truncate(Task::TITLE_MAX_LENGTH), created_by: by,
          notes: I18n.t("site_visits.task_notes", title:), features: [ note ]
        )
      end
    end

    def ends_after_it_starts
      errors.add(:ended_at, :invalid) if ended_at && started_at && ended_at < started_at
    end
end

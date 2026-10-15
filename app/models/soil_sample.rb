# A sampling point on a map: planned on the terrain, taken in the field, then
# analysed by a lab. The typed lab figures live in `results` (see
# RESULT_FIELDS), any other figure of the reports (heavy metals, nitrogen…)
# in `other_results`, and the lab reports themselves (one PDF per analysis)
# are attached as `lab_reports`. What the person's AI read in those reports
# waits in `results_draft` until a human keeps or refuses it
# (SoilAnalysis::ResultsDraft).
class SoilSample < ApplicationRecord
  include PointLocation

  STATUSES = %w[planned sampled].freeze
  SOURCES = %w[human suggested].freeze
  MAX_REPORT_BYTES = 15.megabytes
  MAX_REPORTS = 10
  MAX_OTHER_RESULTS = 60
  MAX_DEPTH_CM = 200
  RESULT_FIELDS = SoilAnalysis::Interpretation::FIELDS
  RESULT_KEYS = RESULT_FIELDS.keys.freeze

  belongs_to :map
  belongs_to :created_by, class_name: "User", optional: true
  has_many_attached :lab_reports

  validates :label, presence: true, length: { maximum: 80 }
  validates :status, inclusion: { in: STATUSES }
  validates :source, inclusion: { in: SOURCES }
  validates :lab, :lab_reference, length: { maximum: 160 }
  validates :depth_from_cm, :depth_to_cm, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: MAX_DEPTH_CM }
  validate :depth_range_is_ordered
  validate :results_are_valid
  validate :lab_reports_are_pdfs

  scope :ordered, -> { order(:id) }

  # Results arrive from forms as strings, with commas: store clean numbers,
  # only known keys, and remember what could not be read.
  def results=(value)
    raw = value.respond_to?(:to_unsafe_h) ? value.to_unsafe_h : value.to_h
    @unreadable_results = []
    clean = {}
    raw.each do |key, entry|
      key = key.to_s
      next unless RESULT_KEYS.include?(key)
      next if entry.nil? || entry.to_s.strip.empty?
      number = SoilAnalysis::TextureClass.number(entry)
      number ? clean[key] = number : @unreadable_results << key
    end
    super(clean)
  end

  # Figures without a typed field, as the lab wrote them: [{ name, value, unit }].
  # The value stays text (« < 0,5 », « 12,3 »): no reading is made of it.
  def other_results=(value)
    clean = Array(value).filter_map do |entry|
      entry = entry.to_unsafe_h if entry.respond_to?(:to_unsafe_h)
      next unless entry.respond_to?(:to_h)
      entry = entry.to_h.stringify_keys
      name = entry["name"].to_s.squish.first(80)
      number = entry["value"].to_s.squish.first(40)
      next if name.empty? || number.empty?
      { "name" => name, "value" => number, "unit" => entry["unit"].to_s.squish.first(30).presence }.compact
    end
    super(clean.uniq { |entry| entry["name"].downcase }.first(MAX_OTHER_RESULTS))
  end

  def analysed? = results.present?
  def draft = SoilAnalysis::ResultsDraft.new(self)
  def depth_label = "#{depth_from_cm}–#{depth_to_cm} cm"

  def as_inertia(analyses: false)
    {
      id:, label:, lng:, lat:, status:, source:,
      depthFromCm: depth_from_cm, depthToCm: depth_to_cm,
      sampledOn: sampled_on&.iso8601, lab:, labReference: lab_reference,
      results: results.slice(*RESULT_KEYS), notes:,
      otherResults: other_results,
      reports: lab_reports.map { |report| { id: report.id, filename: report.filename.to_s, byteSize: report.byte_size } },
      draft: draft.as_inertia,
      createdAt: created_at.iso8601,
      # The reading (bands, explanations, texture class) is an analysis: paid.
      interpretation: analyses && analysed? ? SoilAnalysis::Interpretation.for(self) : nil
    }
  end

  private
    def depth_range_is_ordered
      return unless depth_from_cm && depth_to_cm
      errors.add(:depth_to_cm, :greater_than, count: depth_from_cm) if depth_to_cm <= depth_from_cm
    end

    def results_are_valid
      @unreadable_results.to_a.each do |key|
        errors.add(:base, I18n.t("soil.errors.unreadable_result", field: I18n.t("soil.fields.#{key}.name")))
      end
      results.each do |key, number|
        range = RESULT_FIELDS[key][:range]
        next if range.cover?(number)
        errors.add(:base, I18n.t("soil.errors.out_of_range", field: I18n.t("soil.fields.#{key}.name"), min: range.min, max: range.max))
      end
      fractions = results.slice("sand_pct", "silt_pct", "clay_pct")
      if fractions.size >= 2 && SoilAnalysis::TextureClass.normalize(sand: fractions["sand_pct"], silt: fractions["silt_pct"], clay: fractions["clay_pct"]).nil?
        errors.add(:base, I18n.t("soil.errors.texture_sum"))
      end
    end

    def lab_reports_are_pdfs
      reports = lab_reports.to_a
      errors.add(:base, I18n.t("soil.errors.too_many_reports", max: MAX_REPORTS)) if reports.size > MAX_REPORTS
      reports.each do |report|
        blob = report.blob
        errors.add(:base, I18n.t("soil.errors.report_not_pdf", name: blob.filename.to_s)) unless blob.content_type == "application/pdf"
        errors.add(:base, I18n.t("soil.errors.report_too_large", name: blob.filename.to_s, max: "#{MAX_REPORT_BYTES / 1.megabyte} Mo")) if blob.byte_size > MAX_REPORT_BYTES
      end
    end
end

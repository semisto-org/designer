# The climate observed over thirty years at one ERA5-Land grid cell (0.1°,
# ~9 km): indicators computed once from the hourly reanalysis (see
# ObservedClimate::Indicators) and shared by every map in the cell. Only
# the cell's centre is stored, never a map's exact location.
#
# Life cycle: pending (a CDS job is being submitted, queued or run by
# ObservedClimateJob) -> ready, or failed. A failed cell is tried again
# after RETRY_FAILED_AFTER, a pending one that stopped moving (lost job)
# after STALE_AFTER.
class ObservedClimate < ApplicationRecord
  FIRST_YEAR = 1995
  LAST_YEAR = 2024
  STATUSES = %w[pending ready failed].freeze
  RETRY_FAILED_AFTER = 1.day
  STALE_AFTER = 6.hours

  validates :cell_lat, :cell_lng, :first_year, :last_year, presence: true
  validates :status, inclusion: { in: STATUSES }

  STATUSES.each { |name| define_method(:"#{name}?") { status == name } }

  # The record of the cell holding a point, for the default period;
  # created on first use.
  def self.for_point(point)
    lat, lng = Providers::Era5Land.cell(point.lat, point.lng)
    find_or_create_by!(cell_lat: lat, cell_lng: lng, first_year: FIRST_YEAR, last_year: LAST_YEAR)
  rescue ActiveRecord::RecordNotUnique
    retry
  end

  # The cell's record, with its computation started (first use) or
  # restarted (failed long enough ago, or stuck). Returns the record.
  def self.ensure_for(point)
    record = for_point(point)
    if record.previously_new_record?
      ObservedClimateJob.perform_later(record)
    elsif record.restartable?
      record.restart!
    end
    record
  end

  def restartable?
    (pending? && updated_at < STALE_AFTER.ago) || (failed? && updated_at < RETRY_FAILED_AFTER.ago)
  end

  # Resets the computation and queues the job again, once even when two
  # requests race: only the one that moves updated_at enqueues.
  def restart!
    claimed = self.class.where(id:, updated_at:).update_all(
      status: "pending", job_id: nil, attempts: 0, error: nil, submitted_at: nil, updated_at: Time.current
    )
    return false unless claimed == 1

    reload
    ObservedClimateJob.perform_later(self)
    true
  end

  def fail!(message)
    update!(status: "failed", error: message.to_s[0, 500])
  end

  def cell = { lat: cell_lat.to_f, lng: cell_lng.to_f }
end

# Computes the observed climate of an ERA5-Land cell in the background: a
# CDS job waits in a queue then runs for minutes, so each run does one step
# (submit, poll, or download and compute) and re-enqueues itself with a
# delay until the record is ready or failed (bounded attempts, see
# ObservedClimate::Fetch).
class ObservedClimateJob < ApplicationJob
  queue_as :default
  discard_on ActiveRecord::RecordNotFound

  def perform(observed_climate)
    wait = ObservedClimate::Fetch.new(observed_climate).step
    self.class.set(wait:).perform_later(observed_climate) if wait
  end
end

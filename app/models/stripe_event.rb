# A webhook event, stored exactly once by Stripe event id. Processing is
# idempotent: a processed event is never handled again; a failed one keeps
# its error and is retried when Stripe redelivers it.
class StripeEvent < ApplicationRecord
  RETENTION = 90.days

  validates :stripe_event_id, :event_type, presence: true

  scope :processed, -> { where.not(processed_at: nil) }
  scope :failed, -> { where(processed_at: nil).where.not(error: nil) }

  # Stores the event (or returns the one already stored, even when two
  # deliveries race on the unique index).
  def self.record!(payload)
    create_or_find_by!(stripe_event_id: payload.fetch("id")) do |event|
      event.event_type = payload.fetch("type")
      event.livemode = payload.fetch("livemode", true)
      event.payload = payload
    end
  end

  def self.purge_old!(older_than: RETENTION)
    processed.where(processed_at: ...older_than.ago).delete_all
  end

  def processed? = processed_at.present?

  # Runs the block once under a row lock. Returns :duplicate when the event was
  # already processed, otherwise the block's note. The block's writes roll back
  # with the error; the error is kept on the event so the failure is visible.
  def process_once
    with_lock do
      if processed?
        :duplicate
      else
        note = yield(self)
        update!(processed_at: Time.current, error: nil, note: note.to_s.presence, attempts: attempts + 1)
        note || :processed
      end
    end
  rescue StandardError => e
    self.class.where(id:).update_all(error: "#{e.class}: #{e.message}".truncate(1_000), attempts: attempts + 1, updated_at: Time.current)
    raise
  end
end

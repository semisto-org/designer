# Sends the e-mail digest of a map's live discussion (Collab::ChatDigest).
class ChatDigestJob < ApplicationJob
  queue_as :default
  discard_on ActiveJob::DeserializationError

  def perform(map)
    Collab::ChatDigest.new(map).deliver
  end
end

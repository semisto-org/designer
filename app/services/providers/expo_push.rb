module Providers
  # Expo's push service: sends a notification to the phones where Semisto's
  # app registered (PushDevice). Expo relays to Apple (APNs) and Google (FCM)
  # with the credentials of the EAS project, so the server holds no Apple or
  # Google key.
  #
  #   push = Providers::ExpoPush.new
  #   push.configured?   # false when EXPO_PUSH=off
  #   push.deliver([{ to: "ExponentPushToken[…]", title:, body:, data: {} }])
  #   # => tokens Expo says are no longer registered (to forget)
  #
  # ENV:
  # - EXPO_PUSH: « off » turns phone notifications off (the rest still works);
  # - EXPO_ACCESS_TOKEN: optional, needed once « Enhanced security for push
  #   notifications » is on in the Expo project.
  #
  # Errors never reach the person who wrote the message: a timeout or a bad
  # answer raises Unavailable, which the job logs and lets go.
  class ExpoPush
    class Unavailable < StandardError; end

    URL = "https://exp.host/--/api/v2/push/send".freeze
    BATCH = 100
    OPEN_TIMEOUT = 5
    TIMEOUT = 15

    def self.configured? = ENV["EXPO_PUSH"].to_s.downcase != "off"

    def configured? = self.class.configured?

    # Returns the tokens to forget (DeviceNotRegistered).
    def deliver(messages)
      return [] if messages.empty? || !configured?
      messages.each_slice(BATCH).flat_map { |batch| send_batch(batch) }
    end

    private
      def send_batch(batch)
        response = connection.post(URL, batch.to_json)
        raise Unavailable, "Expo push answered HTTP #{response.status}" unless response.success?
        tickets = Array(JSON.parse(response.body.to_s)["data"])
        tickets.each_with_index.filter_map do |ticket, index|
          batch[index][:to] if ticket.is_a?(Hash) && ticket.dig("details", "error") == "DeviceNotRegistered"
        end
      rescue JSON::ParserError
        raise Unavailable, "Expo push sent an unreadable answer"
      rescue Faraday::Error => error
        raise Unavailable, "Expo push unreachable (#{error.class})"
      end

      def connection
        headers = { "Content-Type" => "application/json", "Accept" => "application/json" }
        headers["Authorization"] = "Bearer #{ENV['EXPO_ACCESS_TOKEN']}" if ENV["EXPO_ACCESS_TOKEN"].present?
        Faraday.new(headers:, request: { open_timeout: OPEN_TIMEOUT, timeout: TIMEOUT })
      end
  end
end

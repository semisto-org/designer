module Mcp
  module Tools
    # What people told Semisto with « Un retour ? »: the person's own
    # feedback, or everyone's for Semisto's team (admins), newest first.
    # With feedback_id, one feedback with its annotated screenshot as an
    # image to look at. Read only: answering happens by e-mail.
    class ListFeedback < Base
      MAX_SIDE = 1568
      LIMIT = 50

      arguments(
        properties: {
          feedback_id: { type: "integer", minimum: 1, description: :feedback_id },
          status: { type: "string", enum: Feedback::STATUSES + %w[awaiting], description: :feedback_status },
          since: { type: "string", format: "date", description: :feedback_since },
          limit: { type: "integer", minimum: 1, maximum: LIMIT, description: :feedback_limit }
        }
      )
      hints

      def perform(feedback_id: nil, status: nil, since: nil, limit: 20)
        return one(feedback_id) if feedback_id

        scope = visible.newest_first.includes(:user, :map, screenshot_attachment: :blob)
        scope = scope.where(created_at: Date.iso8601(since).beginning_of_day..) if since
        scope = status == "awaiting" ? scope.awaiting : scope.where(status:) if status
        { scope: user.admin? ? "everyone" : "mine", feedback: scope.limit(limit).map { |feedback| feedback_json(feedback) } }
      rescue Date::Error
        raise ToolError, t("errors.invalid_date", value: since)
      end

      private
        def visible = user.admin? ? Feedback.all : user.feedbacks

        def one(id)
          feedback = visible.find_by(id:) or raise ToolError, t("errors.feedback_not_found", id:)
          @image = screenshot_of(feedback)
          feedback_json(feedback)
        end

        def feedback_json(feedback)
          {
            id: feedback.id, message: feedback.message, created_at: feedback.created_at.iso8601,
            author: user.admin? ? { name: feedback.user.display_name, email: feedback.user.email_address } : nil,
            page_url: feedback.path && "#{origin}#{feedback.path}",
            map: feedback.map && { id: feedback.map.id, name: feedback.map.name },
            wants_call: feedback.wants_call,
            status: feedback.status, reply: feedback.reply, status_changed_at: feedback.status_changed_at&.iso8601,
            screenshot: feedback.screenshot.attached?,
            context: feedback.context.presence,
            app_version: feedback.app_version
          }.compact
        end

        def screenshot_of(feedback)
          return nil unless feedback.screenshot.attached?
          feedback.screenshot.variant(resize_to_limit: [ MAX_SIDE, MAX_SIDE ], format: :jpeg, saver: { quality: 85 }).processed.download
        rescue StandardError => e
          Rails.logger.warn("[mcp] feedback #{feedback.id} screenshot unreadable: #{e.class}: #{e.message}")
          nil
        end

        def content_for(data)
          return super unless @image
          super + [ { type: "image", data: Base64.strict_encode64(@image), mimeType: "image/jpeg" } ]
        end

        def summarize_result(data) = data[:feedback] ? { feedback: data[:feedback].size } : { feedback_id: data[:id] }
    end
  end
end

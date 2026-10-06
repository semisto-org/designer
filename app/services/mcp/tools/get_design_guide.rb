module Mcp
  module Tools
    # Semisto's design method, chapter by chapter (app/design_guides). The
    # knowledge travels with the server, so every MCP client gets it.
    class GetDesignGuide < Base
      arguments(
        properties: { topic: { type: "string", enum: DesignGuide.topics, description: :topic } }
      )
      hints

      def perform(topic: nil)
        return { chapters: DesignGuide.all.map(&:index_json), start_with: DesignGuide.all.first&.topic } if topic.nil?

        guide = DesignGuide.find(topic) || raise(ToolError, t("errors.guide_not_found", topic:, topics: DesignGuide.topics.join(", ")))
        others = DesignGuide.all.reject { |g| g.topic == guide.topic }.map(&:index_json)
        { topic: guide.topic, title: guide.title, summary: guide.summary, guide: guide.markdown, other_chapters: others }
      end

      private
        def summarize_result(data) = data[:chapters] ? { chapters: data[:chapters].size } : { topic: data[:topic] }
    end
  end
end

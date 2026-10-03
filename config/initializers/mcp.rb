# Model Context Protocol server (app/services/mcp, POST /mcp): report
# exceptions raised inside tools to Rails' error reporter (Sentry).
MCP.configure do |config|
  config.exception_reporter = ->(exception, context) do
    Rails.error.report(exception, handled: true, context: { mcp: context.is_a?(Hash) ? context.except(:principal) : nil }.compact)
  end
end

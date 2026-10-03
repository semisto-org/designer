module Mcp
  # A refusal or validation failure a tool reports to the AI (isError
  # result) rather than a server error. The message is meant to be read.
  class ToolError < StandardError; end
end

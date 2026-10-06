# A chapter of Semisto's design method: a Markdown file in app/design_guides/
# with a front matter (title, summary, order, status). The topic is the file
# name. Served to AI agents by the MCP tool get_design_guide, so that any
# client connected to Designer designs the Semisto way. Versioned with the
# code; no database table. Written in English (repository content); the
# agent answers in the user's language.
#
#   ---
#   title: "Water: slow, spread, infiltrate"
#   summary: One sentence on what the chapter brings.
#   order: 20
#   status: draft
#   ---
class DesignGuide
  DIR = Rails.root.join("app/design_guides")
  FRONT_MATTER = /\A---\s*\n(.*?)\n---\s*\n/m

  attr_reader :topic, :title, :summary, :order, :status, :markdown

  class << self
    # Every chapter, in reading order.
    def all
      files = Dir.glob(DIR.join("*.md")).sort
      signature = files.map { |file| [ file, File.mtime(file).to_f ] }
      return @cache[:guides] if @cache && @cache[:signature] == signature
      guides = files.map { |file| parse(file) }.sort_by { |g| [ g.order, g.topic ] }
      @cache = { signature:, guides: }
      guides
    end

    def find(topic)
      all.find { |guide| guide.topic == topic.to_s }
    end

    def topics = all.map(&:topic)

    private
      # A broken chapter raises: the guides ship with the code and a test
      # reads them all, so the error shows up in CI, not in production.
      def parse(file)
        raw = File.read(file)
        match = FRONT_MATTER.match(raw) || raise(ArgumentError, "#{File.basename(file)}: missing front matter")
        meta = YAML.safe_load(match[1]) || {}
        new(topic: File.basename(file, ".md"), title: meta.fetch("title"), summary: meta.fetch("summary"),
            order: meta.fetch("order", 100).to_i, status: meta.fetch("status", "published"),
            markdown: raw[match.end(0)..].strip)
      end
  end

  def initialize(topic:, title:, summary:, order:, status:, markdown:)
    @topic, @title, @summary, @order, @status, @markdown = topic, title, summary, order, status, markdown
  end

  def index_json = { topic:, title:, summary: }
end

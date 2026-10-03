module CommentsHelper
  # Comment body for e-mail: escaped text, line breaks kept, @mentions in bold.
  def comment_body_html(comment)
    handles = Collab::Mentions.handles(comment.mentioned_users).values
    text = comment.body.to_s
    return simple_format(h(text), {}, wrapper_tag: "p") if handles.empty?

    pattern = /(@(?:#{handles.sort_by { |h| -h.length }.map { |h| Regexp.escape(h) }.join("|")}))(?![[:alnum:]_])/i
    escaped = text.split(pattern).each_with_index.map do |part, i|
      i.odd? ? content_tag(:strong, part) : h(part)
    end
    simple_format(safe_join(escaped), {}, sanitize: false)
  end
end

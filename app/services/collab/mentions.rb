module Collab
  # @mentions in comments. A mention is "@" + the handle of a person who can
  # open the map (their display name, made unique when two people share it).
  # The body stays plain text; the server decides who was mentioned, so a
  # client can never mention someone outside the map.
  class Mentions
    # { user_id => handle } with unique handles among `users`.
    def self.handles(users)
      users = users.to_a
      by_name = users.group_by { |u| u.display_name.to_s.strip.downcase }
      users.to_h do |user|
        base = user.display_name.to_s.strip
        handle = by_name[base.downcase].size == 1 ? base : "#{base} (#{user.email_address.split("@").first})"
        [ user.id, handle ]
      end.then { |map| disambiguate(map) }
    end

    # Users of `users` mentioned in `body`, longest handles first so that
    # "@Marie Dupont" is not read as "@Marie".
    def self.parse(body, users)
      return [] if body.blank?
      users = users.to_a
      handles = self.handles(users)
      remaining = body.dup
      found = []
      users.sort_by { |u| -handles[u.id].length }.each do |user|
        pattern = /(?<![[:alnum:]_@])@#{Regexp.escape(handles[user.id])}(?![[:alnum:]_])/i
        next unless remaining.match?(pattern)
        found << user
        remaining.gsub!(pattern) { |m| " " * m.length }
      end
      found
    end

    def self.disambiguate(map)
      seen = Hash.new(0)
      map.transform_values do |handle|
        seen[handle.downcase] += 1
        seen[handle.downcase] == 1 ? handle : "#{handle} ##{seen[handle.downcase]}"
      end
    end
    private_class_method :disambiguate
  end
end

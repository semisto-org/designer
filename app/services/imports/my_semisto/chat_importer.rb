module Imports
  module MySemisto
    # Brings the chat of a My Semisto project (its Campfire lines) into the
    # live discussion of a Terranova map (« Discussion de la carte »): one
    # Comment per line, with its author and its original date. See
    # lib/tasks/imports.rake for how to run it.
    #
    # - Dry run unless `confirm`: nothing is written, the report says what
    #   would happen.
    # - Quiet: messages are saved inside Comment.importing (no e-mail, digest,
    #   bell, push or live relay, no mention, no follow), and the members of
    #   the discussion get them as already read (mark_read), so years of
    #   history do not light up the bell.
    # - Re-runnable: each line is noted in the ImportRecord ledger (source
    #   "my_semisto", type "CampfireLine", the line's id); a line already
    #   there is never imported again, even if its comment was deleted since.
    # - Authors: a line carries a name and a My Semisto id, never an e-mail;
    #   the e-mail comes from the project's people (the `author_mapping`
    #   overrides or completes it, by My Semisto id or full name). A Terranova
    #   account with that e-mail (any case) is the author; otherwise an
    #   « ancien membre » account is created: real name and e-mail, no
    #   password, no invitation, no access to the map. Nova (the assistant)
    #   and other bots are left out.
    # - Thread replies become ordinary messages starting with a line that
    #   says what they answer.
    # - A line without text (a file shared in the chat) becomes a note that
    #   the file stayed in My Semisto: the API does not expose the files of
    #   chat lines, so there is nothing to copy.
    class ChatImporter
      SOURCE = "my_semisto".freeze
      EXTERNAL_TYPE = "CampfireLine".freeze
      PARENT_EXCERPT = 80
      PREVIEW = 5
      BOT_NAMES = %w[nova].freeze

      Author = Data.define(:key, :name, :first_name, :email, :user) do
        def matched? = user&.persisted?
      end
      Message = Data.define(:line, :author, :body, :created_at, :reply, :attachment)

      class Report
        attr_accessor :map, :project_id, :recording_id, :base_url, :confirmed, :lines, :messages, :replies,
                      :attachments, :already, :bots, :without_email, :authors, :created, :users_created, :marked_read

        def initialize(**values)
          values.each { |key, value| public_send("#{key}=", value) }
          @messages ||= []
          @authors ||= {}
          @without_email ||= {}
          @created = 0
          @users_created = 0
          @marked_read = 0
        end

        def to_s
          t = ->(key, **values) { I18n.t("my_semisto_import.report.#{key}", **values) }
          matched = authors.values.select(&:matched?)
          created = authors.values.reject(&:matched?)
          out = []
          out << t.(:title, map: map.name, id: map.id)
          out << (confirmed ? t.(:confirmed) : t.(:dry_run))
          out << t.(:source, url: base_url, project: project_id, recording: recording_id)
          out << t.(:counts, lines:, messages: messages.size, replies: messages.count(&:reply), attachments: messages.count(&:attachment))
          out << t.(:already, count: already) if already.positive?
          out << t.(:bots, count: bots)
          out << t.(:matched_title, count: matched.size)
          matched.each { |a| out << t.(:matched, name: a.name, email: a.user.email_address, id: a.user.id) }
          out << t.(:unmatched_title, count: created.size)
          created.each { |a| out << t.(:unmatched, name: a.name, email: a.email) }
          if without_email.any?
            out << t.(:without_email_title)
            without_email.each { |name, count| out << t.(:without_email, name:, count:) }
          end
          if confirmed
            out << t.(:done, comments: self.created, users: users_created, reads: marked_read)
          elsif messages.any?
            out << t.(:preview_title, count: [ messages.size, PREVIEW ].min)
            messages.first(PREVIEW).each do |m|
              out << t.(:preview, at: I18n.l(m.created_at, format: "%d/%m/%Y %H:%M"), name: m.author.name)
              m.body.each_line { |line| out << "      #{line.chomp}" }
            end
            out << t.(:next_step)
          end
          out.join("\n")
        end
      end

      attr_reader :report

      # `author_mapping`: { "8" or "Antoine Vilain" => "antoine@example.org" }.
      def initialize(map:, client:, project_id:, recording_id: nil, confirm: false, author_mapping: {})
        @map = map
        @client = client
        @project_id = Integer(project_id)
        @recording_id = recording_id.presence && Integer(recording_id)
        @confirm = confirm
        @author_mapping = author_mapping.transform_keys { |key| key.to_s.strip.downcase }
      end

      def call
        recording_id = @recording_id || @client.campfire_id(@project_id)
        lines = @client.lines(recording_id)
        @people = @client.people(@project_id).index_by { |person| person["id"] }
        @report = Report.new(map: @map, project_id: @project_id, recording_id:, base_url: @client.base_url,
                             confirmed: @confirm, lines: lines.size, already: 0, bots: 0)
        plan(lines)
        write if @confirm
        report
      end

      # Turns an HTML body into plain text: paragraphs and breaks become new
      # lines, a link keeps its address in clear.
      def self.html_to_text(html)
        source = html.to_s
        return source.strip unless source.match?(/<[a-z!\/][^>]*>/i)
        fragment = Nokogiri::HTML::DocumentFragment.parse(source)
        fragment.css("a[href]").each do |link|
          href = link["href"].to_s.strip
          text = link.text.strip
          link.replace(text.blank? || text == href || href.start_with?("mailto:") ? (text.presence || href) : "#{text} (#{href})")
        end
        fragment.css("br").each { |node| node.replace("\n") }
        fragment.css("p, div, li, h1, h2, h3, h4, blockquote, pre, tr").each { |node| node.add_next_sibling("\n") }
        fragment.css("li").each { |node| node.prepend_child("- ") }
        fragment.text.gsub(/ /, " ").gsub(/[ \t]+\n/, "\n").gsub(/\n{3,}/, "\n\n").strip
      end

      private
        def plan(lines)
          done = ImportRecord.where(map: @map, source: SOURCE, external_type: EXTERNAL_TYPE).pluck(:external_id).to_set
          by_id = lines.index_by { |line| line["id"] }
          lines.each do |line|
            next report.bots += 1 if bot?(line)
            next report.already += 1 if done.include?(line["id"].to_s)
            author = author_for(line)
            next report.without_email[line["author"].to_s] = report.without_email[line["author"].to_s].to_i + 1 unless author

            text, attachment = text_of(line)
            parent = by_id[line["thread_parent_id"]] if line["thread_parent_id"]
            body = parent ? "#{reply_prefix(parent)}\n#{text}" : text
            next if body.blank?
            report.messages << Message.new(line:, author:, body: body.truncate(Comment::MAX_LENGTH, omission: "…"),
                                           created_at: Time.zone.parse(line["created_at"].to_s) || Time.current,
                                           reply: parent.present?, attachment:)
          end
        end

        def write
          ActiveRecord::Base.transaction do
            Comment.importing do
              report.messages.each { |message| import(message) }
            end
            mark_read
          end
        end

        def import(message)
          author = message.author
          unless author.user.persisted?
            author.user.save!
            report.users_created += 1
          end
          comment = Comment.create!(commentable: @map, author: author.user, body: message.body,
                                    created_at: message.created_at, updated_at: message.created_at)
          ImportRecord.create!(map: @map, source: SOURCE, external_type: EXTERNAL_TYPE, external_id: message.line["id"].to_s,
                               record: comment, imported_at: Time.current)
          report.created += 1
        end

        # The members of the discussion have « read » up to the newest imported
        # message, but never past a real message they have not read yet.
        def mark_read
          return if report.messages.empty?
          newest = report.messages.map(&:created_at).max
          imported = ImportRecord.where(map: @map, source: SOURCE, external_type: EXTERNAL_TYPE, record_type: "Comment").select(:record_id)
          @map.chat_participants.find_each do |user|
            last_read = CommentRead.find_by(user:, commentable: @map)&.last_read_at
            next if last_read && last_read >= newest
            pending = @map.comments.visible.where(commentable_type: "Map").where.not(author_id: user.id).where.not(id: imported)
            pending = pending.where("created_at > ?", last_read) if last_read
            first_unread = pending.minimum(:created_at)
            at = first_unread && first_unread <= newest ? first_unread - 0.001 : newest
            next if last_read && last_read >= at
            CommentRead.mark!(user, @map, at:)
            report.marked_read += 1
          end
        end

        def bot?(line)
          return true if line["chatbot_id"].present?
          person = @people[line["author_id"]]
          BOT_NAMES.include?(line["author"].to_s.strip.downcase) || person&.dig("email").to_s.start_with?("nova@")
        end

        def author_for(line)
          key = line["author_id"].presence || line["author"].to_s
          return report.authors[key] if report.authors.key?(key)
          person = @people[line["author_id"]] || {}
          name = line["author"].presence || person["name"].to_s
          email = (@author_mapping[line["author_id"].to_s] || @author_mapping[name.strip.downcase] || person["email"]).to_s.strip.downcase.presence
          return nil unless email
          user = User.find_by("LOWER(email_address) = ?", email) || User.new(email_address: email, name:)
          report.authors[key] = Author.new(key:, name:, first_name: person["first_name"].presence || name.split.first, email:, user:)
        end

        def text_of(line)
          text = self.class.html_to_text(line["body"])
          return [ text, false ] if text.present?
          names = Array(line["attachments"] || line["files"]).filter_map { |file| (file["filename"] || file["name"]).presence if file.is_a?(Hash) }
          note = names.any? ? names.map { |name| I18n.t("my_semisto_import.attachment", name:) }.join("\n") : I18n.t("my_semisto_import.attachment_unnamed")
          [ note, true ]
        end

        def reply_prefix(parent)
          person = @people[parent["author_id"]] || {}
          first_name = person["first_name"].presence || parent["author"].to_s.split.first.presence || "?"
          excerpt = self.class.html_to_text(parent["body"]).squish
          excerpt = "#{excerpt[0, PARENT_EXCERPT].rstrip}…" if excerpt.length > PARENT_EXCERPT
          excerpt = I18n.t("my_semisto_import.attachment_unnamed") if excerpt.blank?
          I18n.t("my_semisto_import.reply_prefix", name: first_name, excerpt:)
        end
    end
  end
end

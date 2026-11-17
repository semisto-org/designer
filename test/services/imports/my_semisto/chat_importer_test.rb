require "test_helper"

class Imports::MySemisto::ChatImporterTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper
  include ActionMailer::TestHelper

  HOST = "https://my.semisto.test/api/v1".freeze

  setup do
    @map = maps(:ahinvaux)
    @michael = users(:michael)
    @people = [
      { id: 1, name: "Michael Hulet", first_name: "Michael", email: "MICHAEL@example.org" },
      { id: 2, name: "Nova", first_name: "Nova", email: "nova@terranova.semisto.org" },
      { id: 8, name: "Antoine Vilain", first_name: "Antoine", email: "a.vilain@semisto.test" }
    ]
    @lines = [
      line(13, "<p>Voici le <a href=\"https://exemple.org/plan\">plan</a><br>et la suite</p>", 8, "2025-03-02T10:00:00+01:00", thread_parent_id: 10),
      line(12, "Je regarde le sol cette semaine.", 2, "2025-03-01T12:00:00+01:00", author: "Nova"),
      line(11, nil, 8, "2025-03-01T11:00:00+01:00", attachments: [ { filename: "analyse-sol.pdf" } ]),
      line(10, "Hello @Antoine ! On lance le design de Chiny, tu peux me dire quand tu passes sur le terrain ?", 1,
           "2025-03-01T10:00:00+01:00", thread_replies_count: 1)
    ]
    stub_api
  end

  test "a dry run writes nothing and tells what would happen" do
    report = nil
    assert_no_difference -> { Comment.count } do
      assert_no_difference -> { User.count } do
        assert_no_difference -> { ImportRecord.count } do
          report = importer.call
        end
      end
    end
    text = report.to_s
    assert_match "Simulation : rien n'est écrit.", text
    assert_match "À importer : 3 messages, dont 1 réponses de fil et 1 pièces jointes.", text
    assert_match "Messages de Nova (assistant) laissés de côté : 1", text
    assert_match "Michael Hulet : michael@example.org (compte n° #{@michael.id})", text
    assert_match "Antoine Vilain : a.vilain@semisto.test (sans mot de passe", text
    assert_match "CONFIRM=oui-importer", text
    assert_no_match(/\u2014/, text)
  end

  test "a real run creates the messages with their original dates, oldest first" do
    importer(confirm: true).call
    comments = @map.comments.where(commentable: @map).chronological.to_a
    assert_equal 3, comments.size
    assert_equal Time.zone.parse("2025-03-01T10:00:00+01:00"), comments.first.created_at
    assert_equal Time.zone.parse("2025-03-01T10:00:00+01:00"), comments.first.updated_at
    assert_equal @michael, comments.first.author
    assert_equal "📎 Fichier : analyse-sol.pdf (resté dans My Semisto)", comments.second.body
    assert_equal [ "10", "11", "13" ], ImportRecord.where(map: @map, source: "my_semisto", external_type: "CampfireLine").pluck(:external_id).sort
  end

  test "a thread reply starts with what it answers, in plain text" do
    importer(confirm: true).call
    reply = @map.comments.chronological.last
    lines = reply.body.lines.map(&:chomp)
    assert_equal "↳ en réponse à Michael : Hello @Antoine ! On lance le design de Chiny, tu peux me dire quand tu passes su…", lines.first
    assert_equal [ "Voici le plan (https://exemple.org/plan)", "et la suite" ], lines.drop(1)
  end

  test "a second run imports nothing twice" do
    importer(confirm: true).call
    report = nil
    assert_no_difference -> { Comment.count } do
      report = importer(confirm: true).call
    end
    assert_equal 3, report.already
    assert_equal 0, report.created
  end

  test "imported messages e-mail, ring and relay nothing, and show as read" do
    assert_no_enqueued_jobs do
      assert_no_difference -> { CommentSubscription.count } do
        importer(confirm: true).call
      end
    end
    assert @map.comments.all? { |comment| comment.mentioned_user_ids.empty? }
    assert_nil @map.reload.chat_digest_at
    assert_equal Time.zone.parse("2025-03-02T10:00:00+01:00"), CommentRead.find_by(user: @michael, commentable: @map).last_read_at
    assert_equal 0, Collab::ChatInbox.new(@michael, now: Time.zone.parse("2025-03-03T10:00:00+01:00")).total
  end

  test "a real message not read yet stays unread" do
    real = Comment.create!(commentable: @map, author: users(:bob), body: "Un vrai message", created_at: Time.zone.parse("2025-03-01T09:00:00+01:00"))
    importer(confirm: true).call
    last_read = CommentRead.find_by(user: @michael, commentable: @map).last_read_at
    assert_operator last_read, :<, real.created_at
  end

  test "an author unknown to Terranova becomes an ancien membre without access" do
    assert_no_emails { perform_enqueued_jobs { importer(confirm: true).call } }
    antoine = User.find_by(email_address: "a.vilain@semisto.test")
    assert_equal "Antoine Vilain", antoine.name
    assert_nil antoine.password_digest
    assert_not @map.memberships.exists?(user: antoine)
    assert_equal 2, antoine.comments.count
  end

  test "AUTHORS maps a My Semisto author to another e-mail" do
    importer(confirm: true, author_mapping: { "Antoine Vilain" => "alice@example.org" }).call
    assert_nil User.find_by(email_address: "a.vilain@semisto.test")
    assert_equal 2, users(:alice).comments.count
  end

  test "an author with no known e-mail is left out and reported" do
    @people.reject! { |person| person[:id] == 8 }
    stub_api
    report = importer(confirm: true).call
    assert_equal 1, report.created
    assert_equal({ "Antoine Vilain" => 2 }, report.without_email)
  end

  test "html_to_text keeps links as plain addresses" do
    assert_equal "a\nb https://x.org", Imports::MySemisto::ChatImporter.html_to_text("<div>a</div><div>b <a href=\"https://x.org\">https://x.org</a></div>")
    assert_equal "Texte & simple", Imports::MySemisto::ChatImporter.html_to_text("Texte & simple")
    assert_equal "- un\n- deux", Imports::MySemisto::ChatImporter.html_to_text("<ul><li>un</li><li>deux</li></ul>")
  end

  test "a long message is cut to the comment's limit" do
    @lines = [ line(20, "a" * (Comment::MAX_LENGTH + 50), 1, "2025-03-01T10:00:00+01:00") ]
    stub_api
    importer(confirm: true).call
    assert_equal Comment::MAX_LENGTH, @map.comments.last.body.length
  end

  private
    def importer(confirm: false, author_mapping: {})
      client = Imports::MySemisto::Client.new(url: HOST, token: "secret", sleeper: ->(_) { })
      Imports::MySemisto::ChatImporter.new(map: @map, client:, project_id: 166, confirm:, author_mapping:)
    end

    def line(id, body, author_id, created_at, author: nil, **extra)
      names = { 1 => "Michael Hulet", 2 => "Nova", 8 => "Antoine Vilain" }
      { id:, body:, author: author || names[author_id], author_id:, chatbot_id: nil, thread_parent_id: nil,
        thread_replies_count: 0, created_at:, boosts: [] }.merge(extra)
    end

    def stub_api
      WebMock.reset!
      json = ->(data) { { status: 200, body: data.to_json, headers: { "Content-Type" => "application/json" } } }
      stub_request(:get, "#{HOST}/recordings").with(query: { type: "Campfire", project_id: "166" }, headers: { "Authorization" => "Bearer secret" })
        .to_return(json.({ recordings: [ { id: 6782, status: "active" } ] }))
      main = @lines.reject { |l| l[:thread_parent_id] && !l.fetch(:also_in_channel, false) }
      stub_request(:get, "#{HOST}/recordings/6782/lines").with(query: { offset: "0" }).to_return(json.({ lines: main }))
      @lines.select { |l| l[:thread_replies_count].to_i.positive? }.each do |parent|
        replies = @lines.select { |l| l[:thread_parent_id] == parent[:id] }
        stub_request(:get, "#{HOST}/recordings/6782/lines").with(query: { offset: "0", thread_parent_id: parent[:id].to_s })
          .to_return(json.({ lines: replies }))
      end
      stub_request(:get, "#{HOST}/projects/166/people").to_return(json.({ people: @people, access: "invite_only" }))
    end
end

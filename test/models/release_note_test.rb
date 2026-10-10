require "test_helper"

class ReleaseNoteTest < ActiveSupport::TestCase
  def note(**attrs)
    ReleaseNote.new({ title: "Des étiquettes", body: "Pose tes étiquettes.\n\nPuis filtre.", published_on: Date.new(2026, 10, 6) }.merge(attrs))
  end

  test "valid with a title, a body and a day; paragraphs split on blank lines" do
    record = note
    assert record.valid?
    assert_equal [ "Pose tes étiquettes.", "Puis filtre." ], record.paragraphs
  end

  test "requires title, body and day" do
    record = ReleaseNote.new
    assert_not record.valid?
    assert record.errors.of_kind?(:title, :blank)
    assert record.errors.of_kind?(:body, :blank)
    assert record.errors.of_kind?(:published_on, :blank)
  end

  test "a link stays inside the Designer" do
    assert note(link_path: "/help/etiqueter-ses-elements").valid?
    assert_not note(link_path: "https://example.org").valid?
    assert_not note(link_path: "//example.org/x").valid?
    assert_nil note(link_path: "  ").tap(&:valid?).link_path
  end

  test "rejects a screenshot that is not an image" do
    record = note
    record.screenshot.attach(io: StringIO.new("%PDF"), filename: "x.pdf", content_type: "application/pdf")
    assert_not record.valid?
    assert record.errors.of_kind?(:screenshot, :invalid_type)
  end

  test "published and unseen: drafts and future entries are hidden, a new account starts from its creation" do
    user = users(:alice)
    user.update_columns(created_at: 3.days.ago, release_notes_seen_at: nil)
    old = note(title: "Avant", published_at: 5.days.ago).tap(&:save!)
    fresh = note(title: "Après", published_at: 1.day.ago).tap(&:save!)
    note(title: "Brouillon").save!
    note(title: "Demain", published_at: 1.day.from_now).save!

    assert_equal %w[Après Avant], ReleaseNote.published.map(&:title).sort
    assert_equal [ fresh ], ReleaseNote.unseen_by(user).to_a
    user.update_column(:release_notes_seen_at, Time.current)
    assert_empty ReleaseNote.unseen_by(user)
  end

  test "one thumbs up per person, removed with the entry or the account" do
    record = note(published_at: 1.hour.ago).tap(&:save!)
    record.likes.create!(user: users(:alice))
    assert_not record.likes.build(user: users(:alice)).valid?
    assert_difference("ReleaseNoteLike.count", -1) { record.destroy }
  end
end

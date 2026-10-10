require "test_helper"

class ReleaseNotesSeedTest < ActiveSupport::TestCase
  test "creates each entry once, with its screenshot, and never overwrites staff edits" do
    load Rails.root.join("db/seeds/60_release_notes.rb")
    count = ReleaseNote.count
    assert_operator count, :>=, 10
    assert ReleaseNote.where.not(key: nil).all?(&:valid?)
    assert ReleaseNote.find_by(key: "etiquettes").screenshot.attached?
    assert_equal count, ReleaseNote.published.where.not(key: nil).count
    ReleaseNote.find_by(key: "etiquettes").update!(title: "Corrigé")
    load Rails.root.join("db/seeds/60_release_notes.rb")
    assert_equal count, ReleaseNote.count
    assert_equal "Corrigé", ReleaseNote.find_by(key: "etiquettes").title
  end
end

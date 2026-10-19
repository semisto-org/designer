require "test_helper"

class Admin::DesignGuardTest < ActiveSupport::TestCase
  test "sums the baseline per rule and ranks the files with the most departures" do
    Tempfile.create([ "baseline", ".tsv" ]) do |file|
      file.write(<<~TSV)
        # comment
        small-text\t3\tapp/frontend/a.tsx
        bare-button\t2\tapp/frontend/a.tsx
        native-confirm\t1\tapp/frontend/b.tsx
        unknown-rule\t9\tapp/frontend/c.tsx
      TSV
      file.flush
      guard = Admin::DesignGuard.call(file.path)
      assert_equal({ "small-text" => 3, "native-confirm" => 1, "hex-color" => 0, "bare-button" => 2 }, guard[:totals])
      assert_equal %w[app/frontend/a.tsx app/frontend/b.tsx], guard[:files].map { _1[:path] }
      assert_equal 5, guard[:files].first[:total]
      assert_equal 2, guard[:fileCount]
    end
  end

  test "an absent baseline means nothing left to migrate" do
    guard = Admin::DesignGuard.call(Rails.root.join("tmp/no-such-baseline.tsv"))
    assert_equal 0, guard[:totals].values.sum
    assert_empty guard[:files]
  end
end

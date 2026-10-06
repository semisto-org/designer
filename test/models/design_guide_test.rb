require "test_helper"

class DesignGuideTest < ActiveSupport::TestCase
  test "every chapter parses, in reading order, starting with the method" do
    guides = DesignGuide.all
    assert_equal %w[method water structure palette climate], guides.map(&:topic)
    guides.each do |guide|
      assert guide.title.present?, guide.topic
      assert guide.summary.present?, guide.topic
      assert guide.markdown.length > 500, "#{guide.topic} is too short"
      refute guide.markdown.start_with?("---"), "#{guide.topic} keeps its front matter in the body"
    end
  end

  test "find by topic" do
    assert_equal "water", DesignGuide.find("water").topic
    assert_equal "water", DesignGuide.find(:water).topic
    assert_nil DesignGuide.find("nope")
  end

  test "chapters only name topics that exist" do
    DesignGuide.all.each do |guide|
      guide.markdown.scan(/`([a-z_]+)`/).flatten.select { |word| %w[method water structure palette climate].include?(word) }
        .each { |topic| assert DesignGuide.find(topic), "#{guide.topic} names #{topic}" }
    end
  end
end

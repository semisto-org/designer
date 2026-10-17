require "test_helper"

class EcoIndexTest < ActiveSupport::TestCase
  test "scores a page the way ecoindex.fr does" do
    result = EcoIndex.new(dom_elements: 324, requests: 34, kilobytes: 2055)
    assert_equal 69, result.score
    assert_equal "C", result.grade
    assert_in_delta 1.62, result.ges_grams, 0.01
    assert_in_delta 2.43, result.water_centiliters, 0.02
  end

  test "a tiny page is an A and a huge one a G" do
    assert_equal "A", EcoIndex.new(dom_elements: 10, requests: 2, kilobytes: 10).grade
    huge = EcoIndex.new(dom_elements: 1_000_000, requests: 10_000, kilobytes: 1_000_000)
    assert_equal "G", huge.grade
    assert_operator huge.score, :>=, 0
  end

  test "grades follow the published thresholds" do
    { 81 => "A", 80 => "B", 71 => "B", 70 => "C", 56 => "C", 41 => "D", 26 => "E", 11 => "F", 10 => "G" }.each do |score, grade|
      assert_equal grade, EcoIndex.grade(score), score
    end
  end
end

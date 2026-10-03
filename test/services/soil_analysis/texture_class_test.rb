require "test_helper"

class SoilAnalysis::TextureClassTest < ActiveSupport::TestCase
  T = SoilAnalysis::TextureClass

  # A typical point of each of the 12 USDA classes (sand, silt, clay in %).
  TYPICAL = {
    "sand" => [ 90, 5, 5 ],
    "loamy_sand" => [ 82, 12, 6 ],
    "sandy_loam" => [ 65, 25, 10 ],
    "loam" => [ 40, 40, 20 ],
    "silt_loam" => [ 20, 65, 15 ],
    "silt" => [ 7, 87, 6 ],
    "sandy_clay_loam" => [ 60, 15, 25 ],
    "clay_loam" => [ 33, 34, 33 ],
    "silty_clay_loam" => [ 10, 56, 34 ],
    "sandy_clay" => [ 52, 6, 42 ],
    "silty_clay" => [ 6, 47, 47 ],
    "clay" => [ 20, 20, 60 ]
  }.freeze

  TYPICAL.each do |key, (sand, silt, clay)|
    test "#{sand}/#{silt}/#{clay} is #{key}" do
      assert_equal key, T.classify(sand:, silt:, clay:)
    end
  end

  test "the typical points cover the 12 classes" do
    assert_equal T::CLASSES.sort, TYPICAL.keys.sort
  end

  test "every point of the triangle has exactly one class" do
    counts = Hash.new(0)
    (0..100).each do |sand|
      (0..(100 - sand)).each do |silt|
        key = T.classify(sand:, silt:, clay: 100 - sand - silt)
        assert_includes T::CLASSES, key, "no class for #{sand}/#{silt}/#{100 - sand - silt}"
        counts[key] += 1
      end
    end
    assert_equal T::CLASSES.sort, counts.keys.sort
  end

  test "known boundaries" do
    assert_equal "clay", T.classify(sand: 0, silt: 0, clay: 100)
    assert_equal "sand", T.classify(sand: 100, silt: 0, clay: 0)
    assert_equal "silt", T.classify(sand: 0, silt: 100, clay: 0)
    assert_equal "silt_loam", T.classify(sand: 10, silt: 70, clay: 20) # the Hesbaye loess
  end

  test "two fractions are enough, the third is the rest" do
    assert_equal "silt_loam", T.classify(sand: 20, silt: 65, clay: nil)
    assert_equal({ sand: 20.0, silt: 65.0, clay: 15.0 }, T.normalize(sand: 20, silt: 65, clay: nil))
  end

  test "a total close to 100 is rescaled, a total far from 100 is refused" do
    normalized = T.normalize(sand: 20, silt: 66, clay: 15) # 101
    assert_in_delta 100, normalized.values.sum, 1e-9
    assert_nil T.classify(sand: 40, silt: 40, clay: 40)
    assert_nil T.classify(sand: 20, silt: 30, clay: 20)
  end

  test "refuses what is not a texture" do
    assert_nil T.classify(sand: nil, silt: nil, clay: 30)
    assert_nil T.classify(sand: "abc", silt: 30, clay: 30)
    assert_nil T.classify(sand: -5, silt: 55, clay: 50)
    assert_nil T.classify(sand: 80, silt: 40, clay: nil) # the rest would be negative
  end

  test "accepts decimal commas as typed in French" do
    assert_equal "loam", T.classify(sand: "40,5", silt: "39,5", clay: "20")
  end

  test "every class has a French name and a description" do
    T::CLASSES.each do |key|
      assert_not_includes T.label(key), "translation missing", key
      assert_not_includes T.description(key), "translation missing", key
    end
    assert_equal "Limon", T.label("silt_loam")
    assert_equal "Argile limoneuse", T.label("silty_clay")
  end
end

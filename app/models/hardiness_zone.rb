# USDA plant hardiness zone, defined by the average annual extreme minimum
# temperature (the coldest night of the year, averaged over ~30 years).
# Zones are 10 °F wide and split into halves "a" (colder) and "b" (5 °F
# each), from 1a (below -51.1 °C) to 13b (above +15.6 °C).
#
#   HardinessZone.for_temperature(-13.0).code  # => "7b"
#   HardinessZone.parse("zone-8").min_c         # => -12.2 (lower bound of 8a)
#
# Source of the definition: USDA Agricultural Research Service, Plant
# Hardiness Zone Map (2012, updated 2023).
class HardinessZone
  include Comparable

  MIN_NUMBER = 1
  MAX_NUMBER = 13
  HALF_WIDTH_F = 5.0
  BASE_F = -60.0

  attr_reader :number, :half

  # Zone of a site whose average annual extreme minimum is `celsius`.
  def self.for_temperature(celsius)
    return nil if celsius.nil?
    fahrenheit = celsius.to_f * 9 / 5 + 32
    index = ((fahrenheit - BASE_F) / HALF_WIDTH_F).floor.clamp(0, MAX_NUMBER * 2 - 1)
    new(index / 2 + 1, index.even? ? "a" : "b")
  end

  # "7b", "7", 7, "zone-7", "Zone 7b", "USDA 7" -> zone (a bare number means
  # the colder half: a plant "hardy to zone 7" survives the 7a minimum).
  def self.parse(value)
    return value if value.is_a?(HardinessZone)
    return nil if value.blank?
    match = value.to_s.downcase.match(/(\d{1,2})\s*([ab])?/)
    return nil unless match
    number = match[1].to_i
    return nil unless number.between?(MIN_NUMBER, MAX_NUMBER)
    new(number, match[2] || "a")
  end

  def initialize(number, half = "a")
    @number = Integer(number)
    @half = half.to_s
    raise ArgumentError, "unknown zone #{number}#{half}" unless @number.between?(MIN_NUMBER, MAX_NUMBER) && %w[a b].include?(@half)
  end

  def code = "#{number}#{half}"
  def to_s = code

  # Position on a continuous scale: 7a -> 7.0, 7b -> 7.5.
  def value = number + (half == "b" ? 0.5 : 0.0)

  def <=>(other)
    other.is_a?(HardinessZone) ? value <=> other.value : nil
  end

  def hash = code.hash
  def eql?(other) = other.is_a?(HardinessZone) && code == other.code

  # Temperature bounds of the half-zone, in °C (rounded to 0.1).
  def min_c = to_celsius(BASE_F + half_index * HALF_WIDTH_F)
  def max_c = to_celsius(BASE_F + (half_index + 1) * HALF_WIDTH_F)

  def as_json(*)
    { code:, number:, half:, value:, minC: min_c, maxC: max_c }
  end

  private
    def half_index = (number - 1) * 2 + (half == "b" ? 1 : 0)

    def to_celsius(fahrenheit) = ((fahrenheit - 32) * 5 / 9).round(1)
end

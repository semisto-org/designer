# The sources a catalogue value can cite. A source is a short key stored on
# each `PlantFieldSource`; known ones have a label (plants.sources.* in the
# locale) and a default licence. Unknown keys are allowed (a new provider
# does not need a deploy) as long as they look like keys.
module PlantSource
  FORMAT = /\A[a-z0-9][a-z0-9_.-]{1,39}\z/

  KNOWN = {
    "semisto" => { license: nil },
    "terranova" => { license: nil },
    "pfaf" => { license: "PFAF, usage non commercial" },
    "trefle" => { license: nil },
    "usda" => { license: "domaine public US" },
    "wikipedia" => { license: "CC BY-SA 4.0" },
    "designer" => { license: nil },
    "user" => { license: nil }
  }.freeze

  module_function

  def known?(key) = KNOWN.key?(key.to_s)

  def default_license(key) = KNOWN.dig(key.to_s, :license)

  def valid?(key) = key.to_s.match?(FORMAT)
end

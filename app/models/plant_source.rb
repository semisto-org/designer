# The sources a catalogue value can cite. A source is a short key stored on
# each `PlantFieldSource`; known ones have a label (plants.sources.* in the
# locale) and a default licence. Unknown keys are allowed (a new provider
# does not need a deploy) as long as they look like keys.
#
# A cross-check-only source (PFAF, whose licence is non-commercial) never
# becomes the source of a value in this paid service (Michael, 2026-11-02):
# it only says « recoupée avec PFAF » next to the value's own source. Values
# that already cite it stay shown (decision of 2026-10-03).
module PlantSource
  FORMAT = /\A[a-z0-9][a-z0-9_.-]{1,39}\z/

  KNOWN = {
    "semisto" => { license: nil },
    # A Semisto design project's plant list (palette spreadsheet), 2026.
    "semisto_walhain" => { license: nil },
    "terranova" => { license: nil },
    "pfaf" => { license: "PFAF, usage non commercial", cross_check_only: true },
    "trefle" => { license: nil },
    "usda" => { license: "domaine public US" },
    "wikipedia" => { license: "CC BY-SA 4.0" },
    "designer" => { license: nil },
    "user" => { license: nil }
  }.freeze

  module_function

  def known?(key) = KNOWN.key?(key.to_s)

  def default_license(key) = KNOWN.dig(key.to_s, :license)

  def cross_check_only?(key) = KNOWN.dig(key.to_s, :cross_check_only) == true

  def valid?(key) = key.to_s.match?(FORMAT)
end

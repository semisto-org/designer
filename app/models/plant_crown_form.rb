# The silhouette of a tree or a shrub grown in the open, which the 3D view
# draws (relief/growth.ts, plantShape): round (a lime, an apple), spreading
# (a chestnut, a walnut: wider than tall, low branches), columnar (an Italian
# cypress), conical (a fir, a larch), weeping (a weeping willow) or
# multi-stem (a hazel, an elder, an amelanchier: many stems from the ground).
#
# The species' own value (`crown_form`, provenanced like every catalogue
# field) wins; otherwise the usual silhouette of its genus, from Semisto's
# own reading of the trees of its gardens, flagged as indicative. A species
# no table knows is drawn round.
module PlantCrownForm
  module_function

  FORMS = %w[round spreading columnar conical weeping multi_stem].freeze

  # Species whose silhouette is not their genus' (lower-case latin binomial).
  BY_SPECIES = {
    "salix babylonica" => "weeping", "salix × sepulcralis" => "weeping", "salix x sepulcralis" => "weeping",
    "salix alba" => "spreading", "salix caprea" => "multi_stem", "salix viminalis" => "multi_stem",
    "salix purpurea" => "multi_stem", "cupressus sempervirens" => "columnar", "juniperus communis" => "columnar",
    "populus nigra" => "spreading", "betula pendula" => "weeping", "corylus colurna" => "conical",
    "pinus pinea" => "spreading", "prunus spinosa" => "multi_stem", "prunus cerasifera" => "round",
    "acer campestre" => "round", "carpinus betulus" => "round", "tilia cordata" => "round",
    "sorbus domestica" => "round", "cornus mas" => "multi_stem", "morus alba" => "spreading", "morus nigra" => "spreading"
  }.freeze

  # The usual silhouette of a genus.
  BY_GENUS = {
    # Wider than tall once grown in the open, branching low.
    "castanea" => "spreading", "juglans" => "spreading", "quercus" => "spreading", "morus" => "spreading",
    "gleditsia" => "spreading", "platanus" => "spreading", "ulmus" => "spreading", "mespilus" => "spreading",
    "ficus" => "spreading", "robinia" => "spreading", "albizia" => "spreading", "catalpa" => "spreading",
    "paulownia" => "spreading", "cydonia" => "spreading", "fagus" => "spreading", "zelkova" => "spreading",
    # Round or oval crowns on a trunk.
    "malus" => "round", "pyrus" => "round", "prunus" => "round", "tilia" => "round", "acer" => "round",
    "aesculus" => "round", "fraxinus" => "round", "sorbus" => "round", "diospyros" => "round",
    "carpinus" => "round", "celtis" => "round", "asimina" => "round", "cornus" => "round",
    "alnus" => "round", "betula" => "round", "crataegus" => "round", "ziziphus" => "round",
    # A cone, from the ground or nearly.
    "abies" => "conical", "picea" => "conical", "larix" => "conical", "pseudotsuga" => "conical",
    "metasequoia" => "conical", "sequoia" => "conical", "sequoiadendron" => "conical", "taxodium" => "conical",
    "cedrus" => "conical", "pinus" => "conical", "cryptomeria" => "conical", "thuja" => "conical",
    "chamaecyparis" => "conical", "liquidambar" => "conical", "araucaria" => "conical", "ginkgo" => "conical",
    "taxus" => "conical",
    # Narrow and upright.
    "cupressus" => "columnar",
    # Many stems from the ground.
    "corylus" => "multi_stem", "sambucus" => "multi_stem", "amelanchier" => "multi_stem", "elaeagnus" => "multi_stem",
    "hippophae" => "multi_stem", "cercis" => "multi_stem", "hamamelis" => "multi_stem", "ribes" => "multi_stem",
    "rubus" => "multi_stem", "aronia" => "multi_stem", "viburnum" => "multi_stem", "lonicera" => "multi_stem",
    "vaccinium" => "multi_stem", "rosa" => "multi_stem", "lycium" => "multi_stem",
    "salix" => "multi_stem", "philadelphus" => "multi_stem", "syringa" => "multi_stem", "berberis" => "multi_stem",
    "caragana" => "multi_stem", "colutea" => "multi_stem", "chaenomeles" => "multi_stem", "euonymus" => "multi_stem",
    "ilex" => "conical", "laurus" => "conical"
  }.freeze

  # { form:, indicative: } for a species, or nil when nothing is known.
  def for(species)
    return nil unless species
    return { form: species.crown_form, indicative: false } if FORMS.include?(species.crown_form)
    guess(species.latin_name)
  end

  # The usual silhouette for a latin name (« Castanea sativa 'Marigoule' »), flagged indicative.
  def guess(latin_name)
    words = latin_name.to_s.downcase.split
    return nil if words.empty?
    form = BY_SPECIES[words.first(2).join(" ")] || BY_SPECIES[words.first(3).join(" ")] || BY_GENUS[words.first]
    form && { form:, indicative: true }
  end
end

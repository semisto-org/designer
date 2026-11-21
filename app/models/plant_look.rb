# How a plant looks, as the 3D view paints it (relief/plantModels.ts): the
# tone of its foliage, how fine its leaves are, how dense its crown is, and
# the colour of its flowers, fruits, bark and autumn leaves. Low-poly shapes
# stay shared between species; only their colours and proportions change,
# so a birch reads white-barked and airy, a copper beech purple and dense.
#
# Each trait is a catalogue field, provenanced like the others: the species'
# own value wins. Otherwise the usual look of its species or genus, from
# Semisto's own reading of the plants of its gardens, flagged indicative
# (nothing here is copied from a third-party database). A trait no table
# knows stays empty and the 3D falls back to its strata's colours.
module PlantLook
  module_function

  TRAITS = %i[foliage_tone leaf_texture crown_density flower_color fruit_color bark_color autumn_color].freeze

  # Species whose look differs from their genus' (lower-case latin binomial),
  # trait by trait.
  BY_SPECIES = {
    "betula pendula" => { bark_color: "white" }, "betula pubescens" => { bark_color: "white" },
    "betula utilis" => { bark_color: "white" }, "betula nigra" => { bark_color: "red_brown" },
    "prunus spinosa" => { fruit_color: "blue", bark_color: "dark", autumn_color: "yellow", leaf_texture: "fine", crown_density: "dense" },
    "prunus domestica" => { fruit_color: "purple" }, "prunus insititia" => { fruit_color: "purple" },
    "prunus cerasus" => { fruit_color: "red" }, "prunus padus" => { fruit_color: "black" },
    "prunus serotina" => { fruit_color: "black" }, "prunus armeniaca" => { flower_color: "pink", fruit_color: "orange", bark_color: "brown" },
    "prunus persica" => { flower_color: "pink", fruit_color: "orange", bark_color: "brown", leaf_texture: "fine" },
    "prunus dulcis" => { flower_color: "pink", fruit_color: "green", bark_color: "dark" },
    "prunus laurocerasus" => { foliage_tone: "dark_green", leaf_texture: "coarse", crown_density: "dense", fruit_color: "black", autumn_color: "none" },
    "prunus lusitanica" => { foliage_tone: "dark_green", crown_density: "dense", fruit_color: "black", autumn_color: "none" },
    "malus sylvestris" => { fruit_color: "green" }, "malus domestica" => { fruit_color: "red" },
    "acer rubrum" => { autumn_color: "red", flower_color: "red" }, "acer palmatum" => { autumn_color: "red", leaf_texture: "fine", crown_density: "light" },
    "acer saccharum" => { autumn_color: "orange" }, "acer saccharinum" => { foliage_tone: "light_green", autumn_color: "yellow", bark_color: "silver" },
    "acer pseudoplatanus" => { leaf_texture: "coarse", autumn_color: "brown" },
    "cornus mas" => { flower_color: "yellow", fruit_color: "red", autumn_color: "red" },
    "cornus sanguinea" => { fruit_color: "black", bark_color: "red_brown", autumn_color: "purple" },
    "cornus kousa" => { flower_color: "white", fruit_color: "red", autumn_color: "red" },
    "corylus colurna" => { bark_color: "grey" },
    "quercus rubra" => { autumn_color: "red", leaf_texture: "coarse" },
    "quercus ilex" => { foliage_tone: "dark_green", leaf_texture: "fine", autumn_color: "none" },
    "quercus suber" => { foliage_tone: "dark_green", leaf_texture: "fine", bark_color: "brown", autumn_color: "none" },
    "sorbus domestica" => { fruit_color: "yellow" }, "sorbus torminalis" => { fruit_color: "brown", leaf_texture: "medium" },
    "sorbus aria" => { foliage_tone: "grey_green", leaf_texture: "medium", autumn_color: "brown" },
    "ribes nigrum" => { fruit_color: "black" }, "ribes uva-crispa" => { fruit_color: "green" },
    "rubus fruticosus" => { fruit_color: "black" }, "rubus phoenicolasius" => { bark_color: "red_brown" },
    "morus alba" => { fruit_color: "white", foliage_tone: "light_green" }, "morus nigra" => { fruit_color: "black", foliage_tone: "dark_green" },
    "lonicera caerulea" => { fruit_color: "blue", flower_color: "cream", foliage_tone: "grey_green" },
    "vaccinium vitis-idaea" => { fruit_color: "red", foliage_tone: "dark_green", autumn_color: "none" },
    "vaccinium macrocarpon" => { fruit_color: "red", autumn_color: "purple" },
    "juglans nigra" => { bark_color: "dark", leaf_texture: "fine" },
    "sambucus racemosa" => { fruit_color: "red" },
    "elaeagnus umbellata" => { fruit_color: "red", foliage_tone: "grey_green" },
    "elaeagnus angustifolia" => { fruit_color: "yellow", foliage_tone: "grey_green", leaf_texture: "fine" },
    "elaeagnus × ebbingei" => { leaf_texture: "medium", crown_density: "dense" },
    "elaeagnus x ebbingei" => { leaf_texture: "medium", crown_density: "dense" },
    "pinus nigra" => { bark_color: "dark", crown_density: "dense" }, "picea pungens" => { foliage_tone: "blue_green" },
    "tilia tomentosa" => { foliage_tone: "grey_green" },
    "populus alba" => { foliage_tone: "grey_green", bark_color: "white" },
    "populus tremula" => { bark_color: "silver", crown_density: "light" },
    "salix purpurea" => { bark_color: "red_brown" }, "salix babylonica" => { foliage_tone: "light_green" },
    "crataegus azarolus" => { fruit_color: "orange" },
    "pyrus pyrifolia" => { fruit_color: "brown" },
    "diospyros virginiana" => { fruit_color: "orange" },
    "actinidia arguta" => { fruit_color: "green", leaf_texture: "medium" }, "actinidia deliciosa" => { fruit_color: "brown" },
    "fragaria vesca" => { leaf_texture: "fine" }
  }.freeze

  # The usual look of a genus, in TRAITS order:
  # foliage tone, leaf texture, crown density, flower, fruit, bark, autumn.
  # nil where the genus varies too much to say, or where it does not apply
  # (the bark of an herb).
  BY_GENUS = {
    # Fruit and nut trees.
    "malus" => %w[green medium medium pink red grey yellow],
    "pyrus" => %w[green medium medium white yellow dark orange],
    "prunus" => %w[green medium medium white red red_brown orange],
    "cydonia" => %w[grey_green medium medium pink yellow brown yellow],
    "mespilus" => %w[dark_green coarse medium white brown brown orange],
    "castanea" => %w[dark_green coarse dense cream brown brown yellow],
    "juglans" => %w[green coarse light green green silver yellow],
    "corylus" => %w[green coarse dense yellow brown brown yellow],
    "diospyros" => %w[dark_green coarse medium cream orange dark red],
    "asimina" => %w[green coarse medium purple green grey yellow],
    "ficus" => %w[green coarse medium green purple silver yellow],
    "morus" => %w[green coarse dense green black brown yellow],
    "sorbus" => %w[green fine light white orange silver red],
    "crataegus" => %w[dark_green fine dense white red grey orange],
    "ziziphus" => %w[dark_green fine light green red dark yellow],
    "cornus" => %w[green medium medium white red brown red],
    "amelanchier" => %w[green fine light white purple grey red],
    # Forest and park trees.
    "quercus" => %w[dark_green medium dense green brown dark brown],
    "fagus" => %w[green medium dense green brown silver orange],
    "tilia" => %w[green medium dense cream green grey yellow],
    "acer" => %w[green medium dense yellow brown grey yellow],
    "betula" => %w[light_green fine light green brown white yellow],
    "alnus" => %w[dark_green medium medium green brown dark none],
    "carpinus" => %w[green fine dense green green silver yellow],
    "fraxinus" => %w[green fine light green brown grey yellow],
    "aesculus" => %w[dark_green coarse dense white brown dark orange],
    "ulmus" => %w[dark_green medium dense green green dark yellow],
    "zelkova" => %w[green medium dense green green grey orange],
    "celtis" => %w[green medium medium green purple silver yellow],
    "platanus" => %w[green coarse dense green brown silver brown],
    "populus" => %w[green medium light red] + [ nil ] + %w[grey yellow],
    "salix" => %w[grey_green fine light yellow] + [ nil ] + %w[grey yellow],
    "robinia" => %w[light_green fine light white brown brown yellow],
    "gleditsia" => %w[light_green fine light green brown dark yellow],
    "albizia" => %w[light_green fine light pink brown grey yellow],
    "catalpa" => %w[light_green coarse medium white brown brown yellow],
    "paulownia" => %w[green coarse medium purple brown grey none],
    "liquidambar" => %w[green medium dense green brown dark red],
    "ginkgo" => %w[light_green medium medium green yellow grey yellow],
    "cercis" => %w[green coarse medium pink brown dark yellow],
    # Conifers.
    "abies" => %w[dark_green fine dense green purple silver none],
    "picea" => %w[dark_green fine dense red brown red_brown none],
    "pinus" => %w[dark_green fine medium yellow brown red_brown none],
    "larix" => %w[light_green fine light red brown red_brown yellow],
    "pseudotsuga" => %w[dark_green fine dense green brown brown none],
    "cedrus" => %w[blue_green fine medium green green dark none],
    "taxus" => %w[dark_green fine dense green red red_brown none],
    "thuja" => %w[green fine dense green brown red_brown none],
    "chamaecyparis" => %w[dark_green fine dense green brown red_brown none],
    "cupressus" => %w[dark_green fine dense green brown brown none],
    "metasequoia" => %w[light_green fine light green brown red_brown orange],
    "sequoia" => %w[dark_green fine dense green brown red_brown none],
    "sequoiadendron" => %w[blue_green fine dense green brown red_brown none],
    "taxodium" => %w[light_green fine light green brown red_brown orange],
    "araucaria" => %w[dark_green coarse light green brown grey none],
    "juniperus" => %w[blue_green fine dense green blue red_brown none],
    # Shrubs.
    "sambucus" => %w[green medium medium cream black grey yellow],
    "elaeagnus" => %w[grey_green fine medium cream red brown none],
    "hippophae" => %w[grey_green fine light green orange brown none],
    "ribes" => %w[light_green medium medium green red brown yellow],
    "rubus" => %w[green medium medium white red red_brown none],
    "vaccinium" => %w[green fine medium white blue red_brown red],
    "aronia" => %w[dark_green medium medium white black brown red],
    "viburnum" => %w[dark_green medium dense white red grey red],
    "lonicera" => %w[green medium medium cream red brown none],
    "rosa" => %w[dark_green fine medium pink red brown yellow],
    "lycium" => %w[grey_green fine light purple red grey yellow],
    "hamamelis" => %w[green coarse medium yellow brown grey orange],
    "philadelphus" => %w[green medium medium white brown brown yellow],
    "syringa" => %w[green medium dense purple brown grey none],
    "berberis" => %w[green fine dense yellow red brown red],
    "caragana" => %w[light_green fine light yellow brown grey yellow],
    "colutea" => %w[light_green fine light yellow green brown yellow],
    "chaenomeles" => %w[dark_green medium dense red yellow brown yellow],
    "euonymus" => %w[green medium medium green red brown red],
    "ilex" => %w[dark_green medium dense white red silver none],
    "laurus" => %w[dark_green medium dense yellow black dark none],
    "rhamnus" => %w[dark_green medium medium green black dark yellow],
    "frangula" => %w[green medium light white black dark yellow],
    "ligustrum" => %w[dark_green fine dense white black grey none],
    "buxus" => %w[dark_green fine dense green brown grey none],
    "mahonia" => %w[dark_green coarse medium yellow blue brown none],
    "myrtus" => %w[dark_green fine dense white black brown none],
    "feijoa" => %w[grey_green medium dense red green brown none],
    "acca" => %w[grey_green medium dense red green brown none],
    "eleutherococcus" => %w[green medium medium green black brown yellow],
    "zanthoxylum" => %w[green fine light green red brown yellow],
    "akebia" => %w[green fine medium purple purple brown none],
    # Climbers.
    "vitis" => %w[green coarse medium green purple brown yellow],
    "actinidia" => %w[dark_green coarse dense cream brown brown yellow],
    "humulus" => %w[light_green coarse medium green green] + [ nil ] + %w[yellow],
    "hedera" => %w[dark_green medium dense green black brown none],
    "wisteria" => %w[light_green fine medium purple brown grey yellow],
    "clematis" => %w[green fine light white white brown none],
    "schisandra" => %w[green medium medium cream red brown yellow],
    "passiflora" => %w[dark_green medium medium white orange] + [ nil, nil ],
    # Herbs and ground covers (no bark; they die back rather than colour).
    "symphytum" => [ "dark_green", "coarse", "dense", "purple", nil, nil, nil ],
    "allium" => [ "blue_green", "fine", "light", "purple", nil, nil, nil ],
    "mentha" => [ "green", "medium", "dense", "purple", nil, nil, nil ],
    "melissa" => [ "light_green", "medium", "dense", "white", nil, nil, nil ],
    "origanum" => [ "green", "fine", "dense", "pink", nil, nil, nil ],
    "thymus" => [ "grey_green", "fine", "dense", "pink", nil, nil, nil ],
    "salvia" => [ "grey_green", "medium", "medium", "purple", nil, nil, nil ],
    "lavandula" => [ "grey_green", "fine", "dense", "purple", nil, nil, nil ],
    "rosmarinus" => [ "dark_green", "fine", "dense", "blue", nil, nil, nil ],
    "achillea" => [ "green", "fine", "medium", "white", nil, nil, nil ],
    "urtica" => [ "dark_green", "coarse", "dense", "green", nil, nil, nil ],
    "rumex" => [ "green", "coarse", "medium", "red", nil, nil, nil ],
    "alchemilla" => [ "light_green", "medium", "dense", "yellow", nil, nil, nil ],
    "geranium" => [ "green", "medium", "dense", "pink", nil, nil, nil ],
    "helianthus" => [ "green", "coarse", "medium", "yellow", nil, nil, nil ],
    "cynara" => [ "grey_green", "coarse", "medium", "purple", nil, nil, nil ],
    "foeniculum" => [ "blue_green", "fine", "light", "yellow", nil, nil, nil ],
    "borago" => [ "grey_green", "coarse", "medium", "blue", nil, nil, nil ],
    "calendula" => [ "green", "medium", "medium", "orange", nil, nil, nil ],
    "tropaeolum" => [ "light_green", "medium", "medium", "orange", nil, nil, nil ],
    "rheum" => [ "green", "coarse", "dense", "cream", nil, nil, nil ],
    "fragaria" => [ "green", "medium", "dense", "white", "red", nil, nil ],
    "asparagus" => [ "light_green", "fine", "light", "green", "red", nil, nil ],
    "levisticum" => [ "dark_green", "medium", "medium", "yellow", nil, nil, nil ],
    "petasites" => [ "green", "coarse", "dense", "pink", nil, nil, nil ],
    "ajuga" => [ "purple", "medium", "dense", "blue", nil, nil, nil ],
    "vinca" => [ "dark_green", "fine", "dense", "blue", nil, nil, nil ],
    "lamium" => [ "green", "medium", "dense", "white", nil, nil, nil ],
    "pulmonaria" => [ "green", "coarse", "dense", "blue", nil, nil, nil ],
    "hemerocallis" => [ "green", "fine", "dense", "orange", nil, nil, nil ],
    "echinacea" => [ "dark_green", "medium", "medium", "pink", nil, nil, nil ],
    "valeriana" => [ "green", "fine", "light", "pink", nil, nil, nil ],
    "tanacetum" => [ "green", "fine", "medium", "yellow", nil, nil, nil ]
  }.freeze

  # A cultivar named for its colour: « Fagus sylvatica 'Purpurea' ».
  NAME_TONES = { /purpure|'royal red|'crimson/i => "purple", /'aure|\baurea\b|'gold/i => "yellow_green" }.freeze

  # { trait => { value:, indicative: } } for a species, only for the traits known.
  def for(species)
    return {} unless species
    guessed = guess(species.latin_name)
    TRAITS.each_with_object({}) do |trait, look|
      own = species.public_send(trait)
      if own.present?
        look[trait] = { value: own, indicative: false }
      elsif guessed[trait]
        look[trait] = { value: guessed[trait], indicative: true }
      end
    end
  end

  # The traits the 3D paints with, camelCase (foliageTone…), values only.
  def values(species)
    self.for(species).to_h { |trait, v| [ trait.to_s.camelize(:lower).to_sym, v[:value] ] }
  end

  # The usual look for a latin name, trait by trait: the species' entry, else
  # its genus', with a tone a cultivar name gives (« 'Purpurea' »).
  def guess(latin_name)
    name = latin_name.to_s.downcase.squish
    words = name.split
    return {} if words.empty?
    genus = BY_GENUS[words.first]&.then { |row| TRAITS.zip(row).to_h.compact } || {}
    species = BY_SPECIES[words.first(2).join(" ")] || BY_SPECIES[words.first(3).join(" ")] || {}
    tone = NAME_TONES.find { |pattern, _| latin_name.to_s.match?(pattern) }&.last
    genus.merge(species).merge(tone ? { foliage_tone: tone } : {})
  end
end

# « Territoire »: what the person's AI should look for on a commune, region
# by region (settings `territory.research_grid`, read through
# Territory#research_grid and served by the MCP tool get_territory). The AI
# searches the web itself; Terranova never does. Each entry says where to
# look, not what is true: every find comes back as a draft with its source.
#
# Also marks the overlays a territory opens with (`options.territory_default`).
# Overwritten on every seed: the grid is Semisto's method, kept in the code.
grids = {
  "europe" => [
    { topic: "Ceux qui y travaillent déjà", why: "À rencontrer avant toute recherche : le carnet relie leur travail, il ne le refait pas.",
      where: [ "Autorité de bassin ou syndicat de rivière", "Service environnement de la commune", "Conseillers agricoles du secteur" ] },
    { topic: "Ce que la commune a déjà voté", why: "Les attentes du territoire, chacune avec son année.",
      where: [ "Plan d'aménagement ou d'urbanisme communal", "Plan nature ou biodiversité", "Plan climat de la commune" ] },
    { topic: "Le risque d'inondation", why: "Ce que l'État sait déjà des crues et du ruissellement.",
      where: [ "Plans de gestion des risques d'inondation (directive européenne 2007/60)", "Cartes d'aléa et de risque d'inondation" ] },
    { topic: "Ce qui est arrivé", why: "Des faits datés et localisables, à poser en repères.",
      where: [ "Comptes rendus du conseil communal", "Presse locale (inondations, coulées de boue, sécheresses)", "Reconnaissances de catastrophe naturelle" ] },
    { topic: "Ce qui a disparu", why: "Haies, mares, vergers et chemins d'avant : ce que le paysage savait faire.",
      where: [ "Cartes anciennes", "Photos aériennes anciennes" ] },
    { topic: "Les appels à projets", why: "Ce qui peut financer l'étape suivante (à vérifier par un humain avant d'être cité).",
      where: [ "Programmes régionaux de plantation de haies et d'arbres", "Appels biodiversité et climat pour les communes" ] }
  ],
  "wallonia" => [
    { topic: "Ceux qui y travaillent déjà", why: "À rencontrer avant toute recherche : le carnet relie leur travail, il ne le refait pas.",
      where: [ "Cellule GISER du SPW (avis après coulées de boue)", "Contrat de rivière du sous-bassin (programme d'actions)", "Conseiller ou agent environnement de la commune", "Natagriwal (conseillers en méthodes agro-environnementales)", "Partenaires du PCDN" ] },
    { topic: "Ce que la commune a déjà voté", why: "Les attentes du territoire, chacune avec son année ; un plan ancien se fait confirmer par l'administration.",
      where: [ "PCDN (plan communal de développement de la nature)", "PCDR (programme communal de développement rural)", "Schéma de développement communal", "PST (programme stratégique transversal)", "PAEDC (plan climat, Convention des maires)" ] },
    { topic: "L'eau et le risque", why: "Ce que la Région sait déjà du ruissellement et des crues.",
      where: [ "Programme d'actions du contrat de rivière", "PGRI (plans de gestion des risques d'inondation)", "Cartes d'aléa d'inondation (WalOnMap)", "Axes de ruissellement concentré LIDAXES et ERRUISSOL" ] },
    { topic: "Ce qui est arrivé", why: "Des faits datés et localisables, à poser en repères avec leur source.",
      where: [ "Comptes rendus du conseil communal", "Presse locale et régionale (juillet 2021, coulées de boue)", "Calamités reconnues par le Fonds des calamités", "Avis GISER publiés pour la commune" ] },
    { topic: "Ce qui a disparu", why: "Haies, mares, vergers et chemins d'avant, à comparer avec la photo de 1971.",
      where: [ "Carte de Ferraris (1770-1778)", "Atlas des chemins vicinaux (1841)", "Cartes du Dépôt de la guerre (fin XIXe)", "Photos aériennes depuis 1971 (WalOnMap)" ] },
    { topic: "Les terres agricoles", why: "Qui cultive quoi, et ce qui est déjà engagé, avant de parler d'une haie à un exploitant.",
      where: [ "Parcellaire agricole déclaré (SIGEC)", "Méthodes agro-environnementales et climatiques en cours", "Chambre d'agriculture, syndicats agricoles locaux" ] },
    { topic: "Les appels à projets", why: "Ce qui peut financer l'étape suivante (à vérifier par un humain avant d'être cité).",
      where: [ "Subventions régionales à la plantation de haies et vergers", "Appels Biodiversité et POLLEC pour les communes", "Écorégimes de la PAC" ] }
  ],
  "france" => [
    { topic: "Ceux qui y travaillent déjà", why: "À rencontrer avant toute recherche : le carnet relie leur travail, il ne le refait pas.",
      where: [ "Syndicat de bassin versant (compétence GEMAPI)", "Animateur du SAGE ou du contrat de rivière", "Chambre d'agriculture", "Service environnement de la commune ou de l'intercommunalité" ] },
    { topic: "Ce que la commune a déjà voté", why: "Les attentes du territoire, chacune avec son année.",
      where: [ "PLU ou PLUi (PADD, OAP trame verte et bleue)", "SCoT", "Plan climat-air-énergie territorial (PCAET)", "Atlas de la biodiversité communale" ] },
    { topic: "L'eau et le risque", why: "Ce que l'État sait déjà du ruissellement et des crues.",
      where: [ "SAGE et SDAGE du bassin", "PAPI (programme d'actions de prévention des inondations)", "PPRi et Géorisques" ] },
    { topic: "Ce qui est arrivé", why: "Des faits datés et localisables, à poser en repères avec leur source.",
      where: [ "Arrêtés de catastrophe naturelle (Géorisques)", "Délibérations du conseil municipal", "Presse locale" ] },
    { topic: "Ce qui a disparu", why: "Haies, mares, vergers et chemins d'avant.",
      where: [ "Cadastre napoléonien (archives départementales)", "Carte de Cassini", "« Remonter le temps » de l'IGN (photos aériennes anciennes)" ] }
  ]
}

grids.each do |key, grid|
  region = Region.find_by(key:)
  next unless region
  territory = region.settings.fetch("territory", {})
  region.update!(settings: region.settings.merge("territory" => territory.merge("research_grid" => grid.map(&:stringify_keys))))
end

# The overlays a territory opens with: where water concentrates.
{ "wallonia" => %w[ruissellement] }.each do |key, layer_keys|
  region = Region.find_by(key:)
  next unless region
  region.layers.where(key: layer_keys).find_each do |layer|
    layer.update!(options: layer.options.merge("territory_default" => true)) unless layer.options["territory_default"] == true
  end
end
puts "Territory research grids: #{grids.keys.join(', ')}"

# Import de Claudy

À la bêta, le plan du Domaine d'Ahinvaux (Les 4 Sources, Yvoir) quitte Claudy pour Designer. Claudy garde sa carte d'accueil (hébergements, salles, occupation, séjours) ; tout le reste du plan est versé dans une carte de Designer qui existe déjà, par une commande ponctuelle qu'on peut relancer autant de fois qu'on veut.

```sh
bin/rails claudy:import MAP_ID=12 DRY_RUN=1                 # simulation : ce qui serait fait
bin/rails claudy:import MAP_ID=12                           # par l'API (CLAUDY_API_KEY)
bin/rails claudy:import MAP_ID=12 FILE=tmp/claudy-map/claudy-map.json   # sans réseau
```

| Réglage | Rôle |
|---|---|
| `MAP_ID` | La carte de Designer à remplir (obligatoire). |
| `CLAUDY_API_URL` | Défaut `https://app.les4sources.be/api/v1` (`/api/v1` est ajouté s'il manque). |
| `CLAUDY_API_KEY` | Un des jetons `AGENT_API_TOKEN` de Claudy. L'API n'est que lue, jamais écrite. |
| `FILE` | Un fichier à la place de l'API (voir plus bas). |
| `DRY_RUN=1` | Tout est calculé puis annulé : rien n'est écrit, aucune photo n'est téléchargée. |
| `PHOTOS=0` | Laisse les photos dans Claudy. |
| `FORCE=1` | Remplace aussi ce qui a été modifié dans Designer, recrée ce qui y a été supprimé. |
| `CLAUDY_NETWORK_LAYERS` | Le réseau d'une couche que l'API ne permet pas de reconnaître, par exemple `7=ethernet,8=gas`. |

La commande imprime un résumé en français : créés, mis à jour, inchangés par type d'élément, photos, palette, espèces introuvables, ce qui n'est pas importé et pourquoi, ce qui est laissé tel quel dans Designer, et ce qu'il faut vérifier.

## Ce qui va où

| Claudy | Designer |
|---|---|
| Gestion : zones, chemins, points | Existant : zone, chemin existant, point. Description, « Gestion : … » et le journal daté dans les notes. |
| Réseaux (eau, électricité, ethernet, gaz) | Réseaux (couche sensible, masquée par défaut dans les vues publiques, les exports et le MCP) : conduite d'eau, ligne électrique, câble ethernet, conduite de gaz ; vanne, compteur, robinet, prise ; sinon un point nommé d'après son type (« Citerne », « Switch »…). Origine de l'eau et potabilité (pluie et captage forestier : non potable ; puits : potable). |
| Vue 3D : baissière, keyline, mare, haie | Eau : baissière, ligne (`design_type: keyline`), mare ; Structures : haie. Largeur, profondeur, berme, pente. |
| Biodiversité : relevés saisis dans Claudy | Notes : point de note (règne, noms, date, nombre). Sans l'observateur. |
| Plantes bio-indicatrices | Notes : point de note avec le diagnostic, les pistes et les limites ; chaque espèce devient une observation du panneau Sol, reliée au catalogue des bio-indicatrices. Sans l'observateur ni l'analyste. |
| Plantes placées | Plantes : plante liée à l'espèce et à la variété du catalogue par le nom latin normalisé ; date de plantation connue (`planted_on`, ou le 1er janvier de l'année avec `planted_on_precision: "year"`) ; numéro, statut, santé, zone et journal dans les notes. Chaque espèce ou variété entre dans la palette de la carte. |
| Plantes introuvables dans le catalogue | Plantes sans espèce, avec `unmatched_species` (nom, nom latin, variété), listées dans le résumé. Le catalogue n'est jamais complété par l'import. |
| Notes manuscrites (export seulement) | Notes : croquis (MultiLineString). |
| Photos (JPEG, PNG, WebP) | Photos de la carte, liées à leur élément, placées s'il s'agit d'un point. Les HEIC sont refusées. |

Une forme que la bibliothèque d'éléments refuse (une mare en MultiPolygon, une valeur hors bornes) entre comme forme générique de la même couche (zone, ligne ou point), signalée dans « À vérifier ». Les valeurs par défaut de la bibliothèque (diamètre, potabilité…) ne sont jamais appliquées : ce que Claudy ne disait pas reste vide.

**Pas importé** : la carte d'accueil (couches Lieux et Accueil : hébergements, salles, accès), les fils de commentaires (ils portent le nom de leurs auteurs, et l'API ne les expose pas), les relevés venus d'observations.be (données de tiers nommant leurs observateurs), les plantes mortes, les plantes sans position (leur espèce entre quand même dans la palette), les tâches du carnet, les jauges, les équipements UniFi, la pépinière, le prix d'achat et le lien Notion des plantes. Aucun utilisateur de Claudy n'est repris.

## Relancer

Chaque élément importé porte `properties.import = { source: "claudy", type: "map_feature", id: 110 }`, et la table `import_records` garde, par élément de Claudy, ce qu'il est devenu et l'empreinte de ce que l'import a écrit. Un nouvel import :

- met à jour ce que personne n'a touché dans Designer ;
- laisse tel quel ce qui y a été modifié ou supprimé (et le dit ; `FORCE=1` pour passer outre) ;
- ne touche jamais à ce qui a été dessiné dans Designer ;
- n'importe une photo qu'une fois ;
- ne supprime rien : un élément effacé dans Claudy reste dans Designer.

## Par l'API

L'API v1 de Claudy donne les objets de la carte (`GET /map_features`) et les plantes (`GET /plants`), 200 par page, puis chaque objet importé en détail (journal, photos). Elle ne donne ni les couches ni les notes manuscrites : le réseau de chaque couche est reconnu à ses nœuds (une citerne est de l'eau, un switch de l'ethernet) ; une couche qui n'a que des lignes est importée sans réseau et le résumé donne la ligne `CLAUDY_NETWORK_LAYERS=…` à ajouter. Pour les notes manuscrites, passer par l'export.

## Par un fichier

`FILE=` accepte trois formes :

1. **L'export de Claudy** (recommandé : couches, notes manuscrites et fichiers des photos compris).
2. Une réponse de l'API enregistrée telle quelle : `{ "data": [...], "meta": {...} }` (objets de la carte ou plantes, avec ou sans le détail).
3. Le GeoJSON de la carte de Claudy (`/map/features.json`) : la couche est devinée, les plantes n'y ont que leur nom commun.

L'export a cette forme (les objets et les plantes sont rendus par les vues `show` de l'API de Claudy ; chaque photo a un `path` relatif au fichier) :

```json
{
  "format": "claudy-map-export", "version": 1, "exported_at": "2026-10-04T06:00:00Z",
  "map_layers":   [{ "id": 5, "kind": "network", "name": "Eau", "settings": { "network": "water" } }],
  "map_features": [{ "id": 110, "feature_kind": "zone", "layer_id": 2, "layer_kind": "management", "name_i18n": { "fr": "…" },
                     "geometry": { "type": "Polygon", "coordinates": [] }, "properties": {},
                     "notes_log": [], "photos": [{ "id": 41, "filename": "verger.jpg", "content_type": "image/jpeg", "path": "photos/41.jpg" }], "tasks": [] }],
  "plants":       [{ "id": 7, "status": "existing", "latitude": 50.34, "longitude": 4.90, "species": { "latin_name": "Malus domestica Borkh." },
                     "variety": { "name": "Reinette grise" }, "notes_log": [], "photos": [] }],
  "map_sketches": [{ "id": 3, "name": "…", "folder": null, "strokes": [{ "points": [[50.339, 4.908]] }] }]
}
```

Pour l'écrire, dans Claudy (sans rien y modifier), enregistrer ce script dans `/tmp/claudy_export.rb` puis lancer `OUT=tmp/claudy-map bin/rails runner /tmp/claudy_export.rb` :

```ruby
# Exports the map plan for Semisto Designer (bin/rails claudy:import FILE=…/claudy-map.json).
out = Pathname(ENV.fetch("OUT", "tmp/claudy-map")).expand_path
out.join("photos").mkpath
renderer = Api::V1::BaseController.renderer.new(http_host: ENV.fetch("HOST", "app.les4sources.be"), https: true)
render = ->(template, assigns) { JSON.parse(renderer.render(template:, assigns:, formats: [:json]))["data"] }
with_files = lambda do |row, attachments|
  row["photos"].each do |photo|
    attachment = attachments.find { |a| a.id == photo["id"] } or next
    photo["path"] = "photos/#{attachment.id}#{File.extname(attachment.filename.to_s).downcase}"
    File.binwrite(out.join(photo["path"]), attachment.download)
  end
  row
end

features = MapFeature.ordered.joins(:map_layer).where.not(map_layers: { kind: %w[venues welcome comments] })
                     .includes(:map_layer, :plant, :map_notes, :map_tasks, photos_attachments: :blob)
                     .map { |feature| with_files.(render.("api/v1/map_features/show", map_feature: feature), feature.photos) }
plants = Plant.ordered.includes(*Api::V1::PlantsController::INCLUDES, :map_tasks, :map_notes, photos_attachments: :blob)
              .map { |plant| with_files.(render.("api/v1/plants/show", plant: plant), plant.photos) }
export = {
  format: "claudy-map-export", version: 1, exported_at: Time.current.iso8601,
  map_layers: MapLayer.ordered.map { |layer| layer.slice(:id, :kind, :name, :settings) },
  map_features: features, plants: plants, map_sketches: MapSketch.ordered.map(&:as_detail)
}
out.join("claudy-map.json").write(JSON.pretty_generate(export))
puts "#{features.size} objets, #{plants.size} plantes, #{export[:map_sketches].size} notes manuscrites : #{out}"
```

Copier ensuite le dossier entier (`claudy-map.json` et `photos/`) à côté de Designer et le supprimer après l'import : il contient les relevés d'observations.be, que l'import écarte mais que le fichier garde.

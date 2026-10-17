# Importing from Claudy

At the beta, the plan of the Domaine d'Ahinvaux (Les 4 Sources, Yvoir) moves from Claudy to Terranova. Claudy keeps its welcome map (lodgings, rooms, occupancy, stays); the rest of the plan is poured into an existing Terranova map by a one-off command that can be run again as often as needed.

```sh
bin/rails claudy:import MAP_ID=12 DRY_RUN=1                 # dry run: what would be done
bin/rails claudy:import MAP_ID=12                           # through the API (CLAUDY_API_KEY)
bin/rails claudy:import MAP_ID=12 FILE=tmp/claudy-map/claudy-map.json   # offline
```

| Setting | Role |
|---|---|
| `MAP_ID` | The Terranova map to fill (required). |
| `CLAUDY_API_URL` | Default `https://app.les4sources.be/api/v1` (`/api/v1` is appended if missing). |
| `CLAUDY_API_KEY` | One of Claudy's `AGENT_API_TOKEN` tokens. The API is only read, never written. |
| `FILE` | A file instead of the API (see below). |
| `DRY_RUN=1` | Everything is computed then rolled back: nothing is written, no photo is downloaded. |
| `PHOTOS=0` | Leaves the photos in Claudy. |
| `FORCE=1` | Also replaces what was changed in Terranova, and recreates what was deleted there. |
| `CLAUDY_NETWORK_LAYERS` | The network of a layer the API cannot identify, for example `7=ethernet,8=gas`. |

The command prints a summary in French: created, updated and unchanged per feature type, photos, palette, species not found, what is not imported and why, what is left as is in Terranova, and what to check.

## What goes where

| Claudy | Terranova |
|---|---|
| Management: zones, paths, points | Existing: zone, existing path, point. Description, « Gestion : … » and the dated log in the notes. |
| Networks (water, electricity, ethernet, gas) | Networks (sensitive layer, hidden by default in public views, exports and the MCP): water pipe, power line, ethernet cable, gas pipe; valve, meter, tap, socket; otherwise a point named after its type (« Citerne », « Switch »…). Water origin and drinkability (rain and forest catchment: not drinkable; well: drinkable). |
| 3D view: swale, keyline, pond, hedge | Water: swale, line (`design_type: keyline`), pond; Structures: hedge. Width, depth, berm, slope. |
| Biodiversity: records entered in Claudy | Notes: note point (kingdom, names, date, count). Without the observer. |
| Bioindicator plants | Notes: note point with the diagnosis, leads and limits; each species becomes an observation in the Soil panel, linked to the bioindicator catalogue. Without the observer or the analyst. |
| Placed plants | Plants: plant linked to the catalogue's species and variety by normalised Latin name (including the catalogue's Latin synonyms, for example *Rosmarinus officinalis* for *Salvia rosmarinus*), or, for a plant with no Latin name, by its French common name if it names only one species; known planting date (`planted_on`, or 1 January of the year with `planted_on_precision: "year"`); number, status, health, zone and log in the notes. Each species or variety joins the map's palette. |
| Plants not found in the catalogue | Plants without a species, with `unmatched_species` (name, Latin name, variety), listed in the summary. The import never adds to the catalogue. |
| Handwritten notes (export only) | Notes: sketch (MultiLineString). |
| Photos (JPEG, PNG, WebP, HEIC) | Map photos, linked to their feature, placed when it is a point. HEIC files are converted to JPEG. |

A shape the feature library refuses (a MultiPolygon pond, an out-of-range value) comes in as a generic shape of the same layer (zone, line or point), flagged under « À vérifier ». The library's default values (diameter, drinkability…) are never applied: what Claudy did not say stays empty.

**Not imported**: the welcome map (Lieux and Accueil layers: lodgings, rooms, accesses), comment threads (they carry their authors' names, and the API does not expose them), records from observations.be (third-party data naming its observers), dead plants, plants without a position (their species still joins the palette), logbook tasks, gauges, UniFi equipment, the nursery, and plants' purchase price and Notion link. No Claudy user is carried over.

## Running it again

Each imported feature carries `properties.import = { source: "claudy", type: "map_feature", id: 110 }`, and the `import_records` table keeps, for each Claudy object, what it became and a fingerprint of what the import wrote. A new import:

- updates what nobody touched in Terranova;
- leaves as is what was changed or deleted there (and says so; `FORCE=1` to override);
- never touches what was drawn in Terranova;
- imports a photo only once;
- deletes nothing: a feature removed in Claudy stays in Terranova;
- links the plants whose species or variety joined the catalogue since the previous import.

## Through the API

Claudy's v1 API gives the map objects (`GET /map_features`) and the plants (`GET /plants`), 200 per page, then each imported object in detail (log, photos). It gives neither the layers nor the handwritten notes: each layer's network is recognised from its nodes (a tank is water, a switch is ethernet); a layer with only lines is imported without a network and the summary gives the `CLAUDY_NETWORK_LAYERS=…` line to add. For handwritten notes, use the export.

## From a file

`FILE=` accepts three shapes:

1. **Claudy's export** (recommended: layers, handwritten notes and photo files included).
2. An API response saved as is: `{ "data": [...], "meta": {...} }` (map objects or plants, with or without the detail).
3. The GeoJSON of Claudy's map (`/map/features.json`): the layer is guessed, and plants only have their common name (matched against the catalogue as above).

The export has this shape (objects and plants are rendered by the `show` views of Claudy's API; each photo has a `path` relative to the file):

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

To write it, in Claudy (without changing anything there), save this script as `/tmp/claudy_export.rb` then run `OUT=tmp/claudy-map bin/rails runner /tmp/claudy_export.rb`:

```ruby
# Exports the map plan for Semisto Terranova (bin/rails claudy:import FILE=…/claudy-map.json).
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
puts "#{features.size} features, #{plants.size} plants, #{export[:map_sketches].size} handwritten notes: #{out}"
```

Then copy the whole folder (`claudy-map.json` and `photos/`) next to Terranova and delete it after the import: it contains the observations.be records, which the import leaves out but the file keeps.

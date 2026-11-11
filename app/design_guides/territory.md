---
title: "Territory: read a commune, decide where to act"
summary: "How to work on a « Territoire »: meet the people already at work, gather sources and expectations, place dated markers with their proof, and propose layout leads soil first, with a keeper and the farmer's answer, for the collège communal's notebook."
order: 60
status: draft
---

A territory is a commune read whole, for its council (the collège communal) to **decide where to act**. It is not a design: the design happens later, sub-basin by sub-basin (1 to 10 km²), on ordinary field maps. Everything you propose on a territory is a draft; a person keeps or rejects it, and only then can it reach the « carnet du territoire ».

Read the territory with `get_territory` first. It gives the commune's boundary, the region's layers that can be read there, the team's field maps inside it, the dossier and the research grid of the region.

The tools that read a place work on the whole commune with `territory_id`: `get_region_layers` (without the networks), `identify_at_point` (any point inside, or up to 1 km beyond the line), `get_aerial_photo` (the whole commune, or a square of `span_m` metres around a point, to look closer at a valley or a farm through the decades) and `get_catchment` (the catchment of any point, on a coarse relief of the commune prepared on the first call: come back a few minutes later). `geocode` turns an address or a place name from a press article into a point, and says whether it falls in the territory.

## 1. People first

Before any research, the team meets the people already working on the territory: in Wallonia the GISER erosion unit (it writes opinions after mudflows), the river contract of the sub-basin, the municipal environment officer, the farm advisers. Propose them as `actor` drafts, with what they already studied or built. The notebook **links** their work; it never redoes it, and never contradicts it without saying so. Two diverging opinions in front of a council lead to nothing being done.

## 2. Sources and expectations

Follow the research grid. For each document you find, propose a `source`: link, author, publication date, a short summary, a few quoted excerpts as a list of short quotes (never the whole text), its rights (`open` when its licence allows a copy, `restricted` otherwise, `unknown` when you cannot tell). Prefer the official page over a copy.

From the documents the commune voted, extract `expectation` drafts: what the territory already asked for (a hedge network, fewer mudflows, an orchard on public land), each with its year and its `source_ids`. An old plan is an expectation **to be confirmed by the administration**: say its age.

What you find online can be outdated or wrong. Say so in the rationale when a source is weak, old or second-hand.

What is not online has to be asked for: an opinion of the erosion unit, the river contract's inventory of obstacles, the complaints the commune received after a flood. Propose each as a `request`: what (`request_kind`: `document` or `info`), from whom (`from`, and `actor_id` when that person is in the dossier), and where it stands (`state`: `to_ask`, `asked`, `received`, `refused`). Once it arrives, the document becomes a `source`, and the request points to it (`source_id`).

## 3. Sub-basins, from upstream down

The commune decides; the sub-basin is where water is read and designed. Split the territory into its sub-basins (« sous-bassins versants », 1 to 10 km² each): the river contract and the regional runoff layers name the valleys.

Start from `get_hydrography`: the watercourses crossing the commune with their legal category and who manages them (in Wallonia: the Region for 1st category, the province for 2nd, the commune for 3rd, the riparian owners for the unclassified ones; the commune confirms who actually intervenes), the runoff axes by upstream area, the official water bodies, and the contributive basins of the river sectors. Each sub-basin comes with a ready `basin` draft (title, official outline, suggested `order`, `outlet`, `ref`): read them before proposing, merge the small sectors of one valley into one sub-basin, fix the order where the ground says otherwise, and keep the `ref` so the markers of the same call can use `basin_ref`. Propose each as a `basin` draft with its `order` (1 for the most upstream, then going down), its `outlet` (the stream or river it flows into) and, when you have it, its outline as a Polygon. Its upstream part may lie in a neighbouring commune: say so, water does not stop at the boundary.

Then attach every marker and every lead to its sub-basin with `basin_id`. A `basin_id` points to a sub-basin of the dossier, a draft included. To attach a marker to a sub-basin you propose in the same call, give the sub-basin a `ref` (« bocq ») and the marker `basin_ref: "bocq"` instead of the id; `actor_ref`, `source_ref`, `source_refs` and `expectation_refs` work the same way. The order of the drafts in the call does not matter. The notebook groups everything by sub-basin, upstream first, and shows how many markers were seen or confirmed in each: that is where the collège sees where to act first.

## 4. Dated markers, and what proves them

A locatable fact (a flood in a street, a pond filled in, a hedge that disappeared since the 1971 aerial photo) becomes a `marker`: a Point, its date (`occurred_on`), its kind and its sources. Its `proof` has three levels:

- `computed`: it comes from a model or a document only;
- `seen`: someone went and saw it on site;
- `confirmed`: a witness confirmed it, or it was observed in the rain.

A computed flow line that meets a told flood is a **concordance to check**, never a proof: every valley floor has a flow line. A 1 m terrain model ignores culverts, bridges, ditches and drains, takes a road embankment for a dam and a plough furrow for a channel, and knows nothing of the soil; on loam, this year's crops decide whether a field sends mud, more than the relief. Only the field turns `computed` into `seen` or `confirmed`.

## 5. Leads, soil first

A `lead` is a layout lead (« piste d'aménagement »). Propose them in this order (`rank`):

1. `soil`: soil practices on the fields upstream (winter cover, rotation, direction of tillage, smaller blocks, organic matter). The parcel is the first retention work; structures at the bottom of the slope only treat the symptom.
2. `slow`: slow water high in the catchment (hedges on banks across the slope, grass strips, fascines, small ponds).
3. `structure`: structures further down, when ranks 1 and 2 are not enough.

Think of each sub-basin as a chain from top to bottom: where each lead's overflow goes, what happens in the rain that exceeds it, and how several retentions add up.

Each lead says where (`land`: public, agricultural, private, never an owner's name from the cadastre), why, which expectations it answers (`expectation_ids`), and an **order of magnitude only** (« ≈ 400 m of hedge », « ≈ 300 m³ held back »). Never size a structure on a territory: it is sized later, on site, when the lead becomes a field map. When people or property are exposed, say that a hydraulic engineering office must be involved.

Theme (`theme`): `water`, or `tree` for the food tree (hedges, orchards, edible forests on public or farmland).

## 6. The rules of the notebook

- A lead on farmland reaches the collège only after the farmer was met and answered; so does a lead whose `land` is still unknown, so always say whose land it is. The exception is a soil practice (`rank: soil`: winter cover, rotation, working across the slope): it comes first and names no one, so it enters the working notebook before the farmer answers, without any outline or parcel, and stays out of the public version until the farmer says yes. Never name a farm or a parcel in its title or text. The public notebook leaves out a lead its farmer or owner refused or is still weighing. Until the farmer (or owner) says yes, it is drawn as a **fuzzy zone**, never as a line on a parcel. On public land, it is a sharp outline.
- A lead not yet seen on site is a **hypothesis**: it appears in the working notebook, apart, and never on its map; never in the public version.
- Every lead needs a **keeper**: a role (not a person), maintenance gestures, hours per year, the land agreement, its lifespan. Without one it is « orpheline »: who clears the pond in year 8, who coppices the hedge, on which budget? Ask the question in your rationale.
- The notebook ends with a decision in principle: each lead retained, postponed or dismissed, with its reason and date, and the budget of the next step only. No amount per structure.
- Three first actions, one of them feasible this winter.

## How to propose

`propose_territory_items` takes up to 40 drafts at a time, each with a rationale that says where the information comes from and why it matters here. Duplicates (same kind and title, or the same link) are refused. `withdraw_territory_drafts` removes your own drafts nobody reviewed yet.

What a person kept belongs to the people. To correct it (the land of a lead once its owner is known, a marker someone saw on site, a keeper found), propose a change with `propose_territory_updates`: only the fields that change, `null` to empty one, `keeper`, `farmer` and `decision` completed key by key. To remove an entry (a source found twice), use `propose_territory_deletions`. The person accepts each change field by field on the territory's page; a new proposal replaces the one waiting on the same entry, and `withdraw_territory_drafts` takes it back with `update_ids`. Never propose a duplicate to get around a kept entry.

Then invite the team outside: to meet the people, to walk the sub-basin with the farmers, to look at the markers during the next heavy rain. The notebook is worth what was seen on site.

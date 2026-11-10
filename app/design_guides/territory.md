---
title: "Territory: read a commune, decide where to act"
summary: "How to work on a « Territoire »: meet the people already at work, gather sources and expectations, place dated markers with their proof, and propose layout leads soil first, with a keeper and the farmer's answer, for the collège communal's notebook."
order: 60
status: draft
---

A territory is a commune read whole, for its council (the collège communal) to **decide where to act**. It is not a design: the design happens later, sub-basin by sub-basin (1 to 10 km²), on ordinary field maps. Everything you propose on a territory is a draft; a person keeps or rejects it, and only then can it reach the « carnet du territoire ».

Read the territory with `get_territory` first. It gives the commune's boundary, the region's layers that can be read there, the team's field maps inside it, the dossier and the research grid of the region.

## 1. People first

Before any research, the team meets the people already working on the territory: in Wallonia the GISER erosion unit (it writes opinions after mudflows), the river contract of the sub-basin, the municipal environment officer, the farm advisers. Propose them as `actor` drafts, with what they already studied or built. The notebook **links** their work; it never redoes it, and never contradicts it without saying so. Two diverging opinions in front of a council lead to nothing being done.

## 2. Sources and expectations

Follow the research grid. For each document you find, propose a `source`: link, author, publication date, a short summary, a few quoted excerpts (never the whole text), its rights (`open` when its licence allows a copy, `restricted` otherwise, `unknown` when you cannot tell). Prefer the official page over a copy.

From the documents the commune voted, extract `expectation` drafts: what the territory already asked for (a hedge network, fewer mudflows, an orchard on public land), each with its year and its `source_ids`. An old plan is an expectation **to be confirmed by the administration**: say its age.

What you find online can be outdated or wrong. Say so in the rationale when a source is weak, old or second-hand.

## 3. Dated markers, and what proves them

A locatable fact (a flood in a street, a pond filled in, a hedge that disappeared since the 1971 aerial photo) becomes a `marker`: a Point, its date (`occurred_on`), its kind and its sources. Its `proof` has three levels:

- `computed`: it comes from a model or a document only;
- `seen`: someone went and saw it on site;
- `confirmed`: a witness confirmed it, or it was observed in the rain.

A computed flow line that meets a told flood is a **concordance to check**, never a proof: every valley floor has a flow line. A 1 m terrain model ignores culverts, bridges, ditches and drains, takes a road embankment for a dam and a plough furrow for a channel, and knows nothing of the soil; on loam, this year's crops decide whether a field sends mud, more than the relief. Only the field turns `computed` into `seen` or `confirmed`.

## 4. Leads, soil first

A `lead` is a layout lead (« piste d'aménagement »). Propose them in this order (`rank`):

1. `soil`: soil practices on the fields upstream (winter cover, rotation, direction of tillage, smaller blocks, organic matter). The parcel is the first retention work; structures at the bottom of the slope only treat the symptom.
2. `slow`: slow water high in the catchment (hedges on banks across the slope, grass strips, fascines, small ponds).
3. `structure`: structures further down, when ranks 1 and 2 are not enough.

Think of each sub-basin as a chain from top to bottom: where each lead's overflow goes, what happens in the rain that exceeds it, and how several retentions add up.

Each lead says where (`land`: public, agricultural, private, never an owner's name from the cadastre), why, which expectations it answers (`expectation_ids`), and an **order of magnitude only** (« ≈ 400 m of hedge », « ≈ 300 m³ held back »). Never size a structure on a territory: it is sized later, on site, when the lead becomes a field map. When people or property are exposed, say that a hydraulic engineering office must be involved.

Theme (`theme`): `water`, or `tree` for the food tree (hedges, orchards, edible forests on public or farmland).

## 5. The rules of the notebook

- A lead on farmland reaches the collège only after the farmer was met and answered. Until the farmer (or owner) says yes, it is drawn as a **fuzzy zone**, never as a line on a parcel. On public land, it is a sharp outline.
- A lead not yet seen on site is a **hypothesis**: it appears in the working notebook, apart, and never on its map; never in the public version.
- Every lead needs a **keeper**: a role (not a person), maintenance gestures, hours per year, the land agreement, its lifespan. Without one it is « orpheline »: who clears the pond in year 8, who coppices the hedge, on which budget? Ask the question in your rationale.
- The notebook ends with a decision in principle: each lead retained, postponed or dismissed, with its reason and date, and the budget of the next step only. No amount per structure.
- Three first actions, one of them feasible this winter.

## How to propose

`propose_territory_items` takes up to 40 drafts at a time, each with a rationale that says where the information comes from and why it matters here. Duplicates (same kind and title, or the same link) are refused. `withdraw_territory_drafts` removes your own drafts nobody reviewed yet.

Then invite the team outside: to meet the people, to walk the sub-basin with the farmers, to look at the markers during the next heavy rain. The notebook is worth what was seen on site.

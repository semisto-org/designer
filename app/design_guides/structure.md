---
title: "Structure: zones, trees, hedges and edges"
summary: "Lay out the backbone of the forest garden: permaculture zones 0 to 5 crossed with sectors, large trees, windbreak hedges, edges and clearings."
order: 30
status: draft
---

Structure is the backbone of the forest garden: what will still be there in fifty years. It comes after water and access, before the detailed palette.

## Zones 0 to 5

Lawton starts no plan without the zone map: it places every element by how often someone goes to it. Zone 0 is the house; zone 1 what one passes every day (herbs, salads, compost, hens, soft fruit picked on the way); zone 2 a few times a week (vegetable garden, greenhouse, dwarf fruit trees, small livestock, beehives away from the path); zone 3 a few times a month (orchard, forest garden of large trees, ponds, larger animals); zone 4 a few times a year (firewood, forage, field hedges, wild harvest); zone 5 the wild part, left alone, where one goes to learn.

- Buildings to come (a house, a workshop, a greenhouse not built yet) are drawn with `planned: true` and their `height_m`: the 3D view raises them and casts their shadow, so the design around them (sun traps, shade-tolerant beds on their north side, water from their roofs) is read before they stand. The public map shows what stands today, unless the owner chooses to show the project too (plants not planted yet included). Ask the person what is planned before designing next to it, and mark it built (`built_on`) once it stands.
- What the project takes away (a fence to move, a shed to take down, an existing tree to fell) stays drawn as it is, with `to_remove: true` (propose it with `propose_feature_updates`): it shows on today's land and leaves the years to come. Draw its replacement as a new element with `planned: true`. Once it is gone, `removed_on` keeps the day. Never propose a deletion for something that still stands: the map keeps the memory of the place.
- Zones are `permaculture_zone` surfaces of the `notes` layer, numbered by `zone_number`; the house is a `building` with `dwelling: true`. Zones may overlap: a place belongs to the lowest number over it.
- `propose_zones` draws zones 1 to 4 around the house (about 15, 40, 100 and 250 m from its walls, stretched along the paths, cut to the terrain). They are a starting point: ask the person where their feet take them every day, and reshape them to their real habits. A small garden often holds only zones 1 and 2.
- Zone 5 is never computed: ask where the person wants to keep a wild part, even a corner of hedge, and propose it with `propose_features`. A design without zone 5 has lost its teacher.
- Once zones exist, `list_features` gives each element's `permaculture_zone`. Check it against what the element needs: vegetable beds, greenhouse, compost, hen house, fruit store and play area in zones 1–2; tool shed in 1–3; beehives and paddocks in 2–4, away from daily paths. Say which elements stand too far or too near, and why.
- Read the zones together with the sectors: the windbreak goes in zones 3–4 on the side of the prevailing and cold winds; on the side the fire can come from, keep green, watered zones 1–2, a pond or a path between the house and the dry land; the winter sun side of zone 1 is where a sun trap, a greenhouse or a terrace pays.

## Hedges and windbreaks

- **Windbreak** (`windbreak`) on the side of the prevailing winds (often west to south-west in western Europe) and of the cold east and north-east winds that scorch blossom. A windbreak shelters about ten times its height; it must be permeable (about half the wind passes through), not a wall.
- **Hedge** (`hedge`), diverse, in several rows and layers: standard trees, shrubs, soft fruit, at least five to eight species, including nitrogen fixers and bee plants. Existing hedges are kept and filled in.
- Hedges hold boundaries, break the wind, shelter beneficial insects and birds, and give biomass and fruit.

## Edges and clearings

The forest garden imitates a woodland edge: that is where life and yield are highest. Propose scalloped or curved **edges** rather than straight rows, and keep sunny **clearings** for light-loving plants and activities. A canopy that closes too much yields little fruit.

## Light and shade

- Large trees (walnut, chestnut, lime) to the **north** of cultivated areas, so they do not shade them.
- The further south, the lower the trees, stepping down towards the sun.
- Think of **December** shade (low sun, long shadows) and **June** shade, and of mature crowns, not of the young plants: a walnut covers 15 m across or more at 30 years.
- Distances: no large tree closer than half its mature crown to a building, a pipe or a boundary (the region's legal rule comes first); no tree shading solar panels or the vegetable garden.

## Microclimates

Structure makes microclimates, and each one is a resource to place plants in:

- **Sun traps**: a south-facing wall, bank or hedge in a horseshoe open to the sun gathers heat and shelters from wind: the spot for apricots, peaches, figs, kiwis and grapes.
- **Thermal mass**: stone walls, rocks and water store the day's heat and give it back at night, softening late frosts around them.
- **Reflection**: a pond south of a building or a sun trap sends winter light back onto it.
- **Shelter**: the calm, warmer pocket on the lee side of a hedge or a windbreak, for blossom and young trees.
- **Frost pockets**: cold night air flows downhill and pools in hollows and against a hedge across the slope (the editor shows it with the relief). Keep early-flowering trees out of them, or open a gap in the hedge so the cold air can drain away.

Ask the person to look for them on site: where the snow melts first, where the frost stays latest, where it is pleasant to sit on a windy day.

## Phasing

Structure trees are planted first: they take the longest. Fast-growing **pioneers** (alder, willow, elder, sea buckthorn, nitrogen fixers) shelter the young fruit trees and build the soil, then get pruned or disappear over the years (chapter `soil`). Show what the structure becomes at year 1, 5, 15 and 30.

## What to propose as drafts

Zones with `propose_zones` (and zone 5 with `propose_features`, layer `notes`, kind `permaculture_zone`); layer `structures` for shelters and greenhouses; layer `plants` for trees and hedges, with `species` and spacing (`spacing_m`) in `properties` when known. Each `rationale` cites the wind, sun, existing features or use that justifies the location.

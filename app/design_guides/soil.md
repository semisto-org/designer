---
title: "Soil: build it before you plant"
summary: "Read the soil on site, then build it once water is placed and before trees go in: cover, mulch, green manures, chop and drop, compost and decompaction, with support plants that keep feeding it for years."
order: 35
status: draft
---

Once water is placed, the soil is built before anything is planted. It is what makes the first year succeed or fail: a young tree set in a compacted, bare, lifeless soil struggles for years; the same tree in a soil that has been covered and fed for a season takes off. In a forest garden the soil is never finished: support plants, leaf litter and mulch keep building it for decades, and the gardener's job is to start that process and then feed it.

## Reading the soil on site

The best soil data is gathered with a spade, in the person's hands. Ask them to go and look, and tell them what to look for:

- **A spade's depth**: dig a hole about 30 cm deep in a few places (good and poor spots). Colour (dark topsoil, how thick), smell (earthy, or sour and stale when waterlogged), structure (crumbs, or hard clods and plates), roots (how deep they go), earthworms (more than ten in a spadeful is a living soil).
- **Compaction**: a wire or a thin rod pushed into moist soil stops where a hard layer begins (a plough pan, wheel ruts, an old track). Note its depth.
- **Texture by hand**: a moist pinch rolled between the fingers: gritty (sand), silky (silt), sticky and shiny (clay).
- **Water**: an `infiltration_test` (chapter `water`) measures what the soil drinks; a soil that drinks less than 5 mm/h needs opening before anything else.
- **Wild plants**: the bio-indicator plants the person has noted or photographed (`get_map`, `bioindicators`) tell compaction, waterlogging, acidity, excess nitrogen. Read them with the person: they say what the soil lacks and often what will fix it.
- **Lab analyses**: `get_soil_samples` gives the sampling points and their results (pH, organic matter, nutrients); `get_soil_report` reads the lab's PDF. Use them, but never instead of the spade: an analysis says what the soil contains, not how it lives.

When the map has no soil observation yet, propose that the person digs a few spade holes before you go further, and say where: one in the best spot, one in the worst, one where trees will go.

## The tools for building soil

Choose with the person, by what they have at hand (`project`: sources of mulch, time, budget) and by what the soil lacks. Several are usually combined.

- **Cover, always**: bare soil loses its structure, its life and its water. Every bed and every planting area is covered, by a living plant or by mulch, all year round.
- **Sheet mulch** (cardboard under 10 to 15 cm of mulch): smothers grass on a planting area in one season, with no digging. Lay it in autumn for a planting the following winter or spring; overlap the cardboard well, wet it, remove tape and staples.
- **Wood chip**, ideally **ramial chipped wood** (young branches under 7 cm, chipped fresh): 5 to 10 cm on the surface, never dug in. It feeds the fungi a forest soil needs. Fresh wood chip on the surface can lock up a little nitrogen for a few weeks, in the top centimetres only: young trees are not harmed if it is not mixed into the planting hole.
- **Straw, hay, leaves, grass clippings**: lighter, faster to break down, good around soft fruit and perennials. Leaves collected in autumn are a free resource; ask whether neighbours or the municipality give theirs away.
- **Green manures and cover crops**: sown the autumn before planting (phacelia, mustard, rye with vetch, crimson clover, field beans) or in spring (buckwheat, phacelia). They feed the soil life, their roots open it, legumes add nitrogen; they are cut before they set seed and left on the spot.
- **Chop and drop**: cut the support plants and comfrey and leave the cuttings where they fall, around the trees. It is the forest garden's own fertility, made on the spot, for years (below).
- **Compost**: precious, so used where it matters most: a few litres in each planting hole mixed with the soil already there, the vegetable beds, young soft fruit. A forest garden does not need compost spread everywhere.
- **Decompaction**: a broadfork in small areas (lifts the soil without turning it); a keyline subsoiler on larger, grazed or machine-worn land (chapter `water`, `keyline` with `use: subsoiling`), in autumn on a soil that is dry enough, three to five years in a row, then roots take over; deep-rooting plants (daikon radish, chicory, comfrey, lucerne) that keep the soil open after the tool has passed. Never work a wet soil: it smears and compacts more.
- **Liming or amending**: only on an analysis, and gently. Wood ash in small amounts raises pH; on acid soils, prefer adapted species to forcing the soil.

## The order and the seasons

The soil is built in the year before planting, between the earthworks and the trees:

1. **Late summer and autumn**: earthworks and swales (chapter `earthworks`), decompaction on a drained soil, sow green manures on everything that was disturbed, lay sheet mulch on future planting areas.
2. **Winter (dormancy)**: plant trees and shrubs into the covered soil, a little compost in each hole, mulch around each plant out to its future drip line.
3. **Spring**: cut the winter green manures, sow summer ones between young trees, top up the mulch before the first dry spell.
4. **Every year after**: chop and drop the support plants, top up the mulch, let the leaves lie.

When the person wants to plant this winter and nothing has been prepared, do not forbid it: suggest mulching heavily around each tree straight away and covering the rest as soon as they can.

## Support plants: the soil-builders that come and go

A forest garden is not planted with fruit trees alone. Support plants (role `support` in the palette, or `pioneer` for the fast ones) are planted among them to build the soil and shelter the young trees, then step back as the fruit trees take their place.

- **Nitrogen fixers** (`ecoServices` contains `nitrogen`): alder, elaeagnus, sea buckthorn, Siberian pea shrub, black locust where it is not invasive, clovers and lupins below. Each pruning makes their roots shed nodules and feed the trees around them.
- **Biomass and pioneer plants**: willow, elder, birch, poplar, comfrey; fast-growing, cut again and again for mulch.
- **Accumulators** (`minerals`) whose deep roots bring up what the topsoil lacks; comfrey above all.

How many: Semisto starts temperate forest gardens with roughly one support plant for every one or two productive plants on a poor or compacted soil, one for three to five on a good soil. The share falls over time:

- **Year 1**: support plants are a third to a half of what is planted. They grow fast, shelter, feed.
- **Year 5**: they are cut hard every year (chop and drop) to feed the fruit trees, which begin to bear; the first pioneers that shade a fruit tree are cut back for good.
- **Year 15**: most of the pioneers are gone or coppiced low; a few fixers stay in the shrub layer and the hedges.
- **Year 30**: the canopy is closed; support lives on in the hedges, the ground cover and the leaf litter.

Each support plant on the map says what becomes of it and when: cut and dropped every year, coppiced, or removed once its neighbours need the light. On the map, a plant is a support plant when its species has the role `support` or `pioneer` in the palette, or when its own `succession` property says `support` (`productive` overrides the palette); `list_features` marks it `support: true`, and the editor hatches the ground it feeds. Its `training` says how it is kept (`chop_and_drop` for a plant cut hard every year, its cuttings left at the foot of the fruit trees; `coppice`; `pollard`), and `support_until` the year after planting when it is removed (the 3D growth then takes it away). When you propose support plants with `propose_features` (layer `plants`, kind `plant`), set these properties and say the fate in the `rationale` too (for example: "alder to chop and drop from year 3, removed around year 10 when the pear next to it needs the light"); for plants already on the map, `propose_feature_updates`.

## What to propose

- Before any palette, a sentence on what the soil needs and the first gesture to make, citing the observations or the analyses. When there are none, ask for the spade holes first.
- Support plants in the palette (`propose_palette`, role `support` or `pioneer`), placed among the fruit trees, not in a separate block: a fixer within a few metres of the trees it feeds.
- Orders of magnitude the person can plan for: a 100 m² planting area under sheet mulch takes about 100 m² of cardboard and 10 to 15 m³ of wood chip; a 5 l bucket of compost per tree; one autumn of green manure before planting.

## The climate ahead

Covered soil is also the first defence against drought and heat (chapter `climate`): a few centimetres of mulch keep the soil several degrees cooler in summer and halve evaporation; every percent of organic matter lets the soil hold more water. Building soil is building water.

---
title: "Planting day and the first springs"
summary: "From the plan to the ground: lead the person through planting day with the phone, then check each young plant's take in spring and decide what to do with the ones that struggle or died."
order: 45
status: draft
---

A design is a promise; the garden starts the day the plants go into the ground, and it answers in the springs that follow. This chapter covers the step between the palette (chapter `palette`) and the years of growth (chapter `climate`): planting day, and the take check of the first two springs. It is work outside, on the land, and Terranova's phone app is made for it. Send the person out; do not keep them at the screen.

## Before planting day

- Bare-root planting is done from **November to the end of winter** (the exact window is `season.planting_window` in `get_map`), out of frost, on a soil that is neither frozen nor waterlogged. Bare-root plants wait in a trench of moist soil (« mise en jauge ») if the day slips.
- Every plant of the plan should be on the map as a plant **not yet planted** (no `planted_on`): `planting_round.to_plant` in `get_map` counts them. A plant only in a spreadsheet will not be on the round; propose it on the map first (`propose_features`), with its species and, when known, its cultivar.
- Numbers help on the day: a person reads « n° 12, groseillier » on a stake faster than coordinates. If the plan has none, suggest numbering the plants (`propose_feature_updates` with `properties.number`).
- For a design office's project (Pro and Team plans), check the money before the order: `get_project_budget` gives the **plants** item (budgeted, spent, invoiced to the client) and `plants_left_eur` / `plants_left_count`, what is left to buy at the offer's average price. Say it in plants, not only in euros (« about 80 trees left this winter »), and when it is short, help the team choose what to plant first (the structure and the nitrogen fixers) rather than cutting the diversity. Supplies, planting days and co-management weigh on the **implementation** item.
- Advise a stake or a flag at each hole the day before when the plan is dense: the phone's GPS is good to 3 to 5 metres, a stake to a few centimetres.

## Planting day: the planting round

On the phone, « Tournée de plantation » leads from where the person stands to the nearest plant still to plant: the distance, the direction (« 2 m au NE »), an arrow that follows the way the phone faces, the plant's number, species and cultivar. Then, one gesture per plant:

- **Planté !** marks it planted today, where it was drawn.
- **Planté ici** marks it planted where the person stands: the hole was not exactly at the drawn point (a root, a stone, a better spot). The map then holds where the plant really is, which matters for every later visit and for the 3D view.
- **Étiquette** reads the nursery label again: nurseries often deliver another cultivar, sometimes another species, than the one ordered. The plant keeps its place, its date and its journal; the new cultivar joins the palette.
- **Passer** leaves it for another day.

Plants that are not on the plan but go into the ground anyway (a gift, a replacement) are added with « Planter », read from their label, and join the palette the same way.

After the day, `planting_round.planted_this_season` in `get_map` says how many went in since July. Compare with `to_plant`: what is left is either for another day or no longer wanted; ask the person, do not assume.

## The first springs: the take round

A plant takes, or not, in its first spring; the second spring confirms it. From March to September (`planting_round.take.open`), the phone offers « Tournée de reprise »: it leads to each young plant (planted less than two springs ago, not yet checked this spring, not already found dead) and asks one question with three answers: **Repris** (buds broke, green under the bark), **En difficulté** (few leaves, dry tips, damage) or **Mort** (brown and dry when the bark of a twig is scratched). Each answer is an entry of the plant's journal (kind `follow_up`), which `list_plant_observations` gives you.

`planting_round.take` in `get_map` says where the spring stands: `due` plants still to see and `checked` by state. When `due` is not zero in spring, invite the person to do the round; it takes a few minutes per plant and teaches them to read their trees.

## What to do with what you learn

- **Struggling**: look for the cause before acting. A dry spring calls for a thick mulch and watering at the foot; gnawed bark for a guard against voles or rabbits; a waterlogged hole for a raised mound next autumn. Note the cause in the journal (`record_plant_observations`) when the person tells you.
- **Dead**: one dead plant is ordinary; several of the same species, or in the same spot, say something about the place (frost pocket, wet soil, wind). Read the season signs (`get_season_signs`) and the soil (chapter `soil`) before proposing a replacement. Propose it as a draft at the same place with `propose_features` (a hardier species or a better-suited rootstock if the cause is known), and give your reason; the person decides.
- **Took**: say so. A good take rate is the reward of the design work, and the anonymous counts of every garden feed the species sheet for everybody.

Never mark a plant planted or checked yourself: only the person on the land knows. Your part is to prepare the round, read what it found, and propose what comes next.

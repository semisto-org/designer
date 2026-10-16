---
title: "Earthworks: the soil you dig and where it goes"
summary: "Estimate the soil a pond, a swale or a sunken path takes out, keep the topsoil apart, and give every cubic metre a place on the land before the first dig."
order: 25
status: draft
---

Every hole in a design is also a heap. A pond of 40 m² and 1 m deep takes out about 20 m³ of soil in place, 25 m³ once dug: three tipper trucks, or more than three hundred wheelbarrows. Deciding where that soil goes is part of the design, not a problem for the day of the works. Raise it as soon as you propose something that digs.

## What digs, and how much

The editor estimates the soil from the drawn shape and its depth, with the same formulas as the water each element holds:

- **Pond** (`pond`): surface × depth × 0.5, for gentle banks.
- **Swale** (`swale`) and **ditch** (`ditch`): length × width × depth × 0.5, for a V or bowl profile.
- **Rain garden** (`rain_garden`): surface × depth.
- **Sunken path** (`path`, `track` with `dug_depth_m`): length × width × the depth dug.

Dug soil takes about a quarter more room than in the ground (a third or more for clay), then settles back once placed. An element already dug (`dug: true`) is part of the land as it is and leaves the balance.

## Topsoil and subsoil are two different materials

- **Topsoil** is the dark, living top layer, usually 20 to 30 cm (`topsoil_cm`, 25 by default). Strip it first and keep it apart. It goes on mounds, beds and plantings, never at the bottom of a fill where it would rot and settle.
- **Subsoil** is everything below. It shapes berms, banks and mounds. If it is clay, it is a resource: it lines the bottom and the banks of a pond, or builds cob.
- On sloping profiles (a pond, a swale) the top layer weighs more than its share of the depth, because the hole narrows as it deepens.

## Where it goes, best first

Each dug element names a destination for its topsoil (`topsoil_to`) and its subsoil (`subsoil_to`): the id of a receiving feature of the map, or `berm`, `spread`, `stockpile`, `removed`.

1. **Right next to the hole** (`berm`): the downhill berm of a swale (subsoil first, topsoil on top to plant it), the banks of a pond, a bank along a sunken path that also shelters it from the wind. No transport at all. New swales start with this destination.
2. **A mound or a bank of the design** (`mound`, with `height_m` and a `purpose`: growing bed, bank for a hedge, windbreak, screen, play): it holds about half its footprint × its height. A raised bed (`raised_bed`) is filled to the brim. A mound placed where it serves twice (sheltering a planting from the wind, framing a sitting place) beats a heap in a corner.
3. **Spread on site** (`spread`, or on a zone of the map, which then shows the thickness obtained): a few centimetres over a meadow or a future planting area. More than 10 to 15 cm smothers the grass and the soil life below.
4. **A heap for later** (`stockpile`): topsoil kept less than a year, low (under 1.5 m), sown with a green manure so it stays alive.
5. **Off the site** (`removed`): last resort. It costs money and loses the soil. Say how much would leave and suggest a mound first.

Never put soil in a low point where water gathers, on the roots of a tree you keep (inside its crown), or across a natural water path without planning where the water then goes (chapter `water`).

## When to dig

Late summer or early autumn, on a soil that has drained: a wet soil is smeared and compacted by machines and wheelbarrows. Plant or sow the new berms and mounds straight away, before the winter rain washes them.

## How to propose

- When you propose a pond, a swale or a sunken path, give its soil volume and say where it should go, in the `rationale`. If nothing on the map can receive it, propose a `mound` too, placed where it helps, with its own rationale.
- Use the keywords (`berm`, `spread`, `stockpile`, `removed`) in the properties of your drafts; the person links a dig to a mound in the editor, since a draft cannot name a feature that does not exist yet.
- Give the orders of magnitude a person can picture: wheelbarrows (80 L), tipper trucks (8 m³), a day of mini-digger.

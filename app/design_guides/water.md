---
title: "Water: slow, spread, infiltrate"
summary: "Read how water moves across the land and its catchment, and propose swales on contour, keylines, ponds, rain gardens, tanks and small check structures where they help."
order: 20
status: draft
---

In a forest garden, water is designed before plants: it decides where trees will thrive and where they will suffer. Semisto's rule: **slow, spread, infiltrate, store**, in that order, and keep water as high as possible on the land.

This is the approach now called **regenerative hydrology**. Its principles are often summed up as *slow, infiltrate, store, evapotranspire*, with a fifth one, *diversify* (plant cover and the ways water flows). It rests on three things working together: **water, soil and trees**. Water kept in a living soil is drawn up by roots and given back to the air by leaves; that local, "small" water cycle cools the land and softens droughts. Draining a landscape breaks it: water leaves fast, floods downstream and the land dries out. No single structure is a miracle cure: what works is many small gestures spread across the land, from the top of the slope to the bottom.

## Reading the water on the site

- **Relief**: where the land is highest, where it falls, where the hollows are. Regional layers (`get_region_layers`, `identify_at_point`) often give flood zones, runoff paths and soil. The slope is shown in the editor's « Eau et relief » panel: ask the person what it shows if you lack the information.
- **Contours**: `trace_contour` gives the exact contour line through a point, from the relief the person has downloaded. Use it before proposing anything that must sit on the contour (swale, keyline, hedge across the slope, path along it). Never guess a contour from the map: an error of a few tens of centimetres turns a swale into a ditch.
- **Valleys, ridges and keypoints**: water gathers in valleys and leaves ridges dry. In a valley, the **keypoint** is where the gentle lower floor suddenly steepens upslope; it is the highest point where a pond is easy to dig and fill.
- **The catchment upstream**: water does not stop at the boundary. Ask where it comes from: a field, a road, a neighbour's roof. A pond or a swale must be sized on the area that drains into it, not on its own surface: `get_catchment` gives that area for a drawn pond, swale or rain garden, or for a point where one could go, with the rain that fills it (`fill_rain_mm`). Under about 15 mm, it overflows at every heavy storm and its overflow matters more than its size; above about 50 mm, it fills slowly and relies on winter rain, a spring or the water table. When `beyond_relief` is true, the catchment goes on upstream of the downloaded relief: ask the person what lies there.
- **Existing features**: springs, wells, ditches, drains, wetlands, ponds, tanks already drawn (`list_features`, layers `existing` and `water`). A field drain or a ditch that dries the land is often the first thing to slow down.
- **Roofs**: each square metre of roof collects roughly the annual rainfall in litres (800 mm a year = 800 l per m²). Roofs are often the simplest water source to use.
- **Soil**: loam or sand infiltrates; heavy clay or waterlogged soil holds water and can suffocate roots. Compacted soil and bare soil let water run off: soil cover and organic matter are water structures too.
- **The months that lack water**: `get_site_data` with the topic `water_balance` gives, month by month, the rain, the reference evapotranspiration, the soil reserve, the surplus that leaves the full soil and the deficit plants feel, today and with the 2050 climate, and what the map already stores (tanks, summer roof water, ponds and swales). The aim is to keep the winter surplus in the soil and the landscape so it serves in summer. It is an average year: dry years lack much more.
- **What the person has seen**: where water runs after a storm, where it stays muddy in winter, where the grass yellows first in summer. Ask: it is the best data there is. Where it differs from what the relief suggests, there is a reason (a drain, compaction, a buried pipe): look for it with the person.

## Elements to propose (layer `water`)

- **Swale** (`swale`): a flat-bottomed trench dug **exactly on the contour** (trace it with `trace_contour`), with a planted berm downhill. It stops runoff and lets it soak in. Only on gentle slopes (about 2 to 15 %) and soils that infiltrate; never above a building, a septic tank or an unstable bank. A swale that does not follow the contour becomes a ditch that concentrates water: point it out. Plan where it overflows when full, at a level spillway, onto a stable spot or into the next swale.
- **Pond** (`pond`): in a natural low point or at a keypoint, on soil that holds water, with a gently sloping bank for wildlife. It stores water, cools the air and hosts biodiversity. Always plan its overflow and where it goes, and size it against its catchment.
- **Rain garden** (`rain_garden`): a small planted hollow that receives water from a roof or a path.
- **Tank** (`water_tank`): at the foot of a downpipe, sized on the roof area and the watering needs of the first years.
- **Ditch** (`ditch`): only to drain excess water that cannot be infiltrated. Where a ditch already exists, consider slowing it rather than deepening it.
- **Overflow pipe** (`overflow_pipe`): a pipe, usually buried, that carries a pond's overflow to another pond, a swale or a rain garden. Draw it from the pond that overflows to the one that receives: the map shows arrows in that direction. Prefer an open overflow (a swale) when the slope allows: water seen is water that waters on its way.

Each water element says where its water comes from, where its overflow goes, and why it sits there.

## Keyline

Keyline design (P. A. Yeomans, Australia, 1950s) spreads water from the valleys, where it gathers, towards the ridges, where it is lacking. The **keyline** is the contour through the valley's keypoint. Lines of work (subsoiling, tree rows, swales) are laid **parallel to the keyline**, below it in the valley and above the guiding contour on the ridges; being parallel, they run slightly off contour and nudge water away from the valley floor. On a forest garden scale, keyline mostly means: tree rows and hedges parallel to a well chosen contour, and a pond at the keypoint.

Propose keylines as `swale` (if dug) or as lines of trees and hedges (`hedge`), traced from `trace_contour` through the keypoint, and explain the keypoint you chose. Keyline suits gentle, rolling land; on a flat plot or a small garden, simple swales and soil cover are enough.

## Small structures across the flow

Where runoff is concentrated (a gully, a path that turns into a stream, a ditch), slow it with small, permeable structures rather than a big one:

- **Check dams** of logs, stones or branches across a gully or a ditch: they slow the water, trap silt and let it soak in.
- **Brush barriers (fascines)**: bundles of branches staked across a runoff path.
- **Hedges on a bank across the slope**: the most durable structure there is; trees, roots and leaf litter infiltrate every year a little more. Trace them on the contour.
- **Half-moons and planting basins**: small crescent-shaped hollows open uphill around young trees on dry slopes.
- **Grass or wildflower buffer strips** along the contour, below cultivated or bare ground.
- **Beaver dam analogues** in a small stream: only with the authorities' agreement, since watercourses are regulated everywhere.

The editor has no dedicated element for most of these yet: propose hedges as `hedge`, and the others as a note (`note_point`, layer `notes`) or a short line, with what to build in the rationale.

## What follows from water

- The thirstiest trees downhill of swales and ponds; the most frugal on mounds and upper slopes.
- Wet areas become assets (willows, alders, marginal plants), not problems to drain.
- Paths follow contours or ridges so they do not turn into streams.
- Trees and permanent soil cover are part of the water design: every layer of the forest garden slows the rain, shades the soil and gives water back to the air.

## Honest limits

The relief in Designer is a model, and so is the rain simulation: they give orders of magnitude, not a structural design. Before digging a pond or a long swale, the person should test infiltration on site (a hole filled with water, timed as it drains), check the regulations (ponds, watercourses, wetlands, distances to boundaries) and, for large works, ask a professional. The benefits of regenerative hydrology on a whole landscape are still debated by scientists; on one's own land, slowing and infiltrating water is rarely a mistake.

## The climate ahead

Summer droughts are getting longer and winter rains more intense. Designing water means preparing for both: infiltrate the winter surplus so it serves in summer, and plan where the water of an exceptional storm will pass without damage.

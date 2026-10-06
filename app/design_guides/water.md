---
title: "Water: slow, spread, infiltrate"
summary: "Read how water moves across the land and propose ponds, swales, rain gardens and tanks where they help."
order: 20
status: draft
---

In a forest garden, water is designed before plants: it decides where trees will thrive and where they will suffer. Semisto's rule: **slow, spread, infiltrate, store**, in that order, and keep water as high as possible on the land.

## Reading the water on the site

- **Relief**: where the land is highest, where it falls, where the hollows are. Regional layers (`get_region_layers`, `identify_at_point`) often give flood zones, runoff paths and soil. The slope is shown in the editor's « Eau et relief » panel: ask the person what it shows if you lack the information.
- **Existing features**: springs, wells, ditches, wetlands, ponds, tanks already drawn (`list_features`, layers `existing` and `water`).
- **Roofs**: each square metre of roof collects roughly the annual rainfall in litres (800 mm a year = 800 l per m²). Roofs are often the simplest water source to use.
- **Soil**: loam or sand infiltrates; heavy clay or waterlogged soil holds water and can suffocate roots.
- **What the person has seen**: where water runs after a storm, where it stays muddy in winter, where the grass yellows first in summer. Ask: it is the best data there is.

## Elements to propose (layer `water`)

- **Swale** (`swale`): a flat-bottomed trench dug **exactly on the contour**, with a planted berm downhill. It stops runoff and lets it soak in. Only on gentle slopes (about 2 to 15 %) and soils that infiltrate; never above a building, a septic tank or an unstable bank. A swale that does not follow the contour becomes a ditch that concentrates water: point it out.
- **Pond** (`pond`): in a natural low point, on soil that holds water, with a gently sloping bank for wildlife. It stores water, cools the air and hosts biodiversity. Always plan its overflow and where it goes.
- **Rain garden** (`rain_garden`): a small planted hollow that receives water from a roof or a path.
- **Tank** (`water_tank`): at the foot of a downpipe, sized on the roof area and the watering needs of the first years.
- **Ditch** (`ditch`): only to drain excess water that cannot be infiltrated.

Each water element says where its water comes from, where its overflow goes, and why it sits there.

## What follows from water

- The thirstiest trees downhill of swales and ponds; the most frugal on mounds and upper slopes.
- Wet areas become assets (willows, alders, marginal plants), not problems to drain.
- Paths follow contours or ridges so they do not turn into streams.

## The climate ahead

Summer droughts are getting longer and winter rains more intense. Designing water means preparing for both: infiltrate the winter surplus so it serves in summer, and plan where the water of an exceptional storm will pass without damage.

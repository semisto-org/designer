---
title: "Bubbles, frame, planting: designing on tracing sheets"
summary: "How a design grows on three tracing sheets over the base plan: rough bubbles for the intentions, then the frame (water, access, structure), then the planting."
order: 15
status: draft
---

A designer does not draw a forest garden in one go. On the base plan of what is already there, they lay a sheet of tracing paper and sketch, then a second sheet over the first, and refine. Terranova works the same way in « Projet »: the card « Feuilles du dessin » lays three sheets, one over the other.

1. **Bubbles** (`bubble`, layer `drawings`): large, loose surfaces that each say an intention, before any element. « Se retrouver le soir », « Cueillir près de la maison », « Garder l'eau en bas », « Laisser une part sauvage ». Each bubble answers one or more functions of the functional analysis (`properties.serves`, the ids of `project` in `get_element_functions`).
2. **Frame**: what the project brings in the layers `water`, `access`, `structures`, `animals` (and `networks`, which you never propose): water first, then access, then structure (chapters `water`, `earthworks`, `structure`).
3. **Planting**: what the project plants (layer `plants`): the large trees first, then each layer below them (chapters `palette`, `planting`).

What is on the ground today is the base plan, under every sheet. While a sheet is on the table, the sheets under it show through the paper and the sheets above it are hidden. A free zone or a note can be put on a sheet by hand (`properties.tracing`: `bubbles`, `frame` or `planting`).

## Bubbles first, when the person is starting

When a map has its project sheet and its functional analysis but no element of the project yet, propose bubbles before anything else, with `propose_bubbles`:

- **One bubble per great use**, not per element. Five to nine bubbles cover most gardens. Never a bubble for a single tree.
- **Place them from the land**: where the water gathers (from `get_catchment`, `trace_contour`, the season notebook), where the winter sun stays (`get_site_data`), where the house and the paths already lead (zones 1 and 2 near the house, chapter `structure`), what the sectors bring in (wind, view, noise). A bubble that needs daily care sits near the house; the wild part far from it.
- **Big and loose.** Four to eight points are enough: the editor rounds the shape. Bubbles may overlap where two uses meet; that overlap is often where the most interesting elements will go.
- **Link every bubble to the functions it answers.** A function of the analysis no bubble answers is a question to ask the person: is it still wanted, and where?
- **Name each bubble with the intention, in the person's words**, never with an element (« Garder l'eau », not « Mare »): the element is the frame's job.

Bubbles are intentions, not elements: they never count as serving a function in `get_element_functions` (each function lists its bubbles under `bubbles`, apart from the elements serving it). Ask the person to walk their land with the bubbles in mind before refining them: where they like to stop, where they never go, where the ground is wet after rain.

## From bubbles to frame and planting

Once the person has kept their bubbles, translate them, sheet by sheet:

- On the **frame**, propose for each bubble the water, access and structure it needs, inside or along it, with `propose_features` and `properties.serves` taken from the bubble's own functions. Say in the rationale which bubble the element answers.
- On the **planting**, propose the plants of each bubble's guilds, structure trees first.
- A bubble with nothing inside it after the frame is an intention not yet translated: say so, and propose for it or ask whether it still holds.

Keep the bubbles once the design is drawn: they explain it. The master plan leaves them out (`get_master_plan`); a pre-design presentation shows them.

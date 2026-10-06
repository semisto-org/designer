# INTENT.md — Semisto Designer

Why this project exists, what it is trying to become, and what it refuses to be. The README says what it is and how to run it; CLAUDE.md says how to work in the code. This file says **why**, for the humans and the AI agents who change it. When a choice is not covered elsewhere, decide in the direction of this file.

## Purpose

Semisto is a Belgian non-profit whose mission is to grow a network of edible forests and multi-layered gardens across Europe. Designer is the tool that lets anyone take part in it, one place at a time.

**Designer aims to be the European reference for designing one's own forest garden, alone or as a team.** Every map adds to the network, but the person who opens Designer comes to design their own place: the product and the website speak about designing first, the mission stays in the background.

Designer also funds Semisto: paid plans bring in revenue that supports the association's work. Both matter, and neither may be traded against the person's trust.

## Who it is for

The core user is a **private individual designing their own forest garden**. What they lack is know-how, not software. After them come Semisto's own designers, past trainees of its courses, teams (collectives, schools, municipalities) and professional designers on the paid plans.

## What Designer is to that person

**A companion that teaches you to read your place and helps you grow as you design, with Semisto's knowledge behind it.**

- It explains what it sees on the land, proposes, shows the reason, and **always leaves the decision to the human**.
- Its posture is that of a Semisto garden guide: "Come, we'll show you." It invites, it never makes anyone feel guilty.
- An empty screen is a companion moment: it says what to look at first and why.

## The thread through every detail: the time of living things

A forest garden is designed over thirty years, and no design tool shows time. Designer shows it everywhere: years 1, 5, 15 and 30 as crowns grow and shade spreads; the seasons (December shade is not June shade; flowering and harvest have their calendar); the memory of the place (the land on arrival, the plan, what was planted and when). If a screen gives no sign that this garden is going to grow, it is not finished.

## The visual language: a living field notebook

Paper, watercolour, hand-drawn lines and notes, and a map that grows before your eyes. The notebook dresses the data; it never distorts it: under the drawing, geometry is exact (PostGIS, metres). Movement is like the wind, not fireworks. The Semisto Design System stays the base.

## Principles

1. **This place, not a template.** Everything starts from the person's real terrain: its boundary, relief, soil, water, climate, what already grows there, and their project sheet.
2. **Water before plants.** The design order is read the place, goals, water, access, structure, then plants, with time and the coming climate at every step. That method is Semisto's, written in `app/design_guides/` and served to any AI through the MCP.
3. **The human decides.** AI never edits a map directly. It proposes drafts, each with its rationale, and a person accepts, adjusts or rejects them one by one.
4. **Any AI, no lock-in.** Designer speaks of "your AI", not of one vendor. The MCP server follows the open standard so that Claude, ChatGPT, Le Chat or any compatible assistant can work on a map with the same knowledge and the same limits.
5. **Open by default.** The code is AGPL-3.0. Data is sourced field by field with its licence; open data is preferred, and licences are respected even when it costs a feature (no PFAF texts, no Rekentool data).
6. **Europe, region by region.** A shared European base, then regional layers. Nothing about one territory is hardcoded; it hangs off a region.
7. **Nothing is taken hostage.** The first map is free and stays useful on its own. When a plan ends, maps stay readable and nothing is deleted.
8. **Done is not the same as good.** A feature is finished when someone has lived it as a user from end to end, on a computer and on a phone.

## What Designer refuses

- The interchangeable SaaS template: a hero, two buttons, a trust strip, "four steps", a six-feature grid. If a page could sell accounting software, it must be redone.
- Smooth vector illustrations, blue-violet "tech" gradients, stock photos.
- An AI that acts behind the person's back, or that only one vendor can use.
- Precision as an identity. Accuracy and teamwork are there, but they serve the companion; they are not what Designer is.

## Not now

The first version covers mapping a terrain, designing and planting it, AI on the map, and understanding the land (water, relief, climate, soil). Deliberately left for later: maintenance and harvest, full livestock, mother plants, a directory of land and businesses, public statistics, weather stations, and a tool for municipalities. The interface is French only for now; Dutch comes with Flanders and the Netherlands.

## Guardrails that are not negotiable

- The name and brand belong to Semisto, which keeps the domain, the repository and the plant catalogue, and can take the service back.
- Sensitive layers (water, gas, electricity and cable networks) are hidden by default in public views, exports and the MCP.
- Code ported from Claudy keeps its MIT notice; nothing personal is ever ported from Terranova.

## How to judge a screen

Before calling a screen ready, ask:

1. **This place**: does it speak about the person's own land, or about a generic one?
2. **Time**: can you see, somewhere, that this garden is going to grow?
3. **The companion**: does it teach something, or propose the next step with its reason?
4. **The notebook**: does it look like a Semisto field notebook, or like any app?
5. **One step further**: which detail shows we thought of the person before they needed it?

A screen that fails two of these is not ready.

## Where to read more

- `docs/point-de-vue.md` (French): the full point of view, decided with Michael Hulet, Semisto's founder, and the reference level of boldness (the home page time-lapse).
- `app/design_guides/`: Semisto's design method, served to AI agents by the MCP tool `get_design_guide`.
- `CLAUDE.md`: the stack, conventions and rules for working in the code.

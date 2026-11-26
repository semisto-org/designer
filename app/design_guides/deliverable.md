---
title: "Handing over: the client's project file"
summary: "What a design office gives its client at the end of a design: the plan, and beside it only the documents, photos, videos and soil analyses the client will use on their land, in the order they will need them."
order: 55
status: draft
---

A design is not finished when the plan is drawn. It is finished when the people who live on the land can carry it out, season after season, without the designer standing next to them. For a design office (Pro and Team plans), Terranova's **client deliverable** (« Livrable client ») is that hand-over: the client's whole project file, at a private link, with no account to create.

It has two parts:

- **The plan**, published from the « Livrable client » panel. It is frozen when the team publishes it, like the public view: the client sees a plan the team has reviewed, never a half-drawn one. When the design changes, the team publishes again (same link).
- **The files the team marks « Dans le livrable client »**: documents, photos, videos and soil points. They are read live: a file marked today is in the client's file today.

The public view (« Publier ») is a different thing: a plan the client shares freely with friends and neighbours. The deliverable is private. Keep the two apart: never put the deliverable's link where the public one belongs.

## What goes in

Choose with the person, file by file, and say what each one is for. A good deliverable answers the questions the client will have on their land in the years after the design:

- **The plan and its reasons.** The project sheet's goals, the master plan, the phasing (« Mise en œuvre »): what is done first and why. A short Markdown page written for the client (what the plan says, the first three things to do this season) is often the most useful document of all.
- **The land as it was found.** Photos of the existing state from fixed spots, before any work: they are the « before » of every « after » the client will take. Photos placed on the map are dots on the client's plan, so the client can walk to each spot and take the same picture again years later.
- **Soil.** The sampled points with their lab reports and the reading of the figures. The points are on the plan too: the client can find where each sample was dug. A point's mark sends its figures, their reading and its lab reports, never its notes; its photos go only when each one is marked itself, so mark the hole and the core, and leave an order form or a price list photographed on site with the team.
- **Water and earthworks.** Sections, dimensions of ponds and swales, the catchment they were sized on: what a contractor needs on the day.
- **Plants.** The planting plan, the palette, the nursery list if there is one.
- **Permits and surveys** the client will be asked for later (architect's plans, a surveyor's report, a permit).

## What stays out

The deliverable is read by the client and by anyone the client forwards it to. Keep out what belongs to the team: offers and invoices, internal meeting notes, discussion files, drafts the team has not reviewed, photos that show people, and the networks (water, gas, electricity, cable), which the panel hides by default.

## Send the client outside

The deliverable is made to be opened on a phone, on the land. Its plan shows where the client is (the position button) and where each marked photo was taken and each soil sample dug. When you help a team prepare one, suggest marking at least a few placed photos of the existing state and the soil points: they turn the file into a walk around the garden. Tell the client, in the deliverable's note, what to go and look at first.

## With your AI

`get_map` returns `deliverable` (published or not, stale, how many files are marked) for the map's editors. `list_documents`, `list_photos` and `get_soil_samples` say `in_deliverable` for each file. `mark_for_deliverable` marks or unmarks files when the person asks, after you have listed what goes to the client. Nothing goes without its own mark: a soil point's photos are photos to mark one by one (`get_soil_samples` says `in_deliverable` for each), and the `marked` counts include them. Publishing or refreshing the plan stays a gesture of the team in the panel.

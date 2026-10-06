---
title: "Palette: layers, guilds and diversity"
summary: "Choose species from Semisto's catalogue, layer by layer, in mutually supporting guilds suited to the soil and climate."
order: 40
status: draft
---

The palette is the list of species in the forest garden and how they fit together. It is chosen once water and structure are in place.

## The seven layers

A forest garden fills space vertically like a woodland edge: **canopy** (large trees), **low trees** (fruit trees), **shrubs** (soft fruit), perennial **herbaceous** plants, **ground cover**, **climbers**, **roots**. The catalogue's `strata` field gives each species' layer. Do not fill every layer everywhere: density comes with time and available light.

## Guilds

A guild is a small group of species around a central tree that help one another:

- a **nitrogen fixer** (alder, elaeagnus, sea buckthorn, pea shrub, clover… `ecoServices` contains `nitrogen`) for about three to five fruit trees at the start;
- **accumulators** and biomass plants (comfrey) for mulching on the spot (`minerals`, `organic-matter`);
- **bee plants** and plants for **beneficial insects** (`mellifere`, `beneficial-insects`), flowering from February to October;
- a **ground cover** so the soil is never bare (`ground-cover`);
- repellent or aromatic plants at the foot.

## Choosing species

Search Semisto's catalogue (`search_plants`, `get_plant`) and check for each species:

- **Hardiness** (`hardinessZone`, `minTemperatureC`) against the site's zone, today and in 2050 (chapter `climate`).
- **Soil and water**: `soilMoisture`, `wateringNeed`, `soilTypes`, `soilPh`, against the site's soil and its position relative to water.
- **Light**: `exposures`, against the shade cast by the structure.
- **Mature size**: `heightMaxM`, `spreadMaxM`, `crownM`, for spacing.
- **What it brings**: `edibleParts`, `edibleRating`, `ecoServices`, and what matters in the project sheet.
- **Native or invasive**: `nativeCountries`, `invasiveCountries`. Never an invasive species in the site's country.
- **Toxicity** (`toxicFor`) if children or animals use the place.

Each catalogue value has a source: cite it when it grounds a choice. If a value is missing, say so rather than inventing it.

## Diversity

- Several varieties per fruit species, with compatible **pollinators** (apples, pears, cherries…).
- Harvests spread over the year (`harvestMonths`) rather than everything in September.
- Several botanical families, so that one disease or pest cannot bring everything down.
- A good share of **native** or well-adapted species, especially in hedges.

## Quantities

Space trees by their mature crown, but plant denser at first with pioneers and shrubs to be thinned later. Propose quantities realistic for the person's budget and time, and remember that the youngest plants often establish best.

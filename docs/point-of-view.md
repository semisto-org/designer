# Semisto Designer — our point of view

Version 1, 5 October 2026. Defined together with Michael after Katie Dill's (Stripe) talk on "zombie UI". This document is the basis for every design, copy and feature choice, whether made by a person or by an agent. When in doubt, it is the reference.

## What we want to become

**The European reference for designing one's own forest garden, alone or as a team.**

A network of edible forests across Europe is what Semisto's mission is about, and every map contributes to it. But the person who arrives on the site comes to design their own: the site talks about designing first, and the network stays in the background.

## Who we are for the person who opens it

**A companion that teaches you to read your place and helps you grow as you design, with Semisto's knowledge behind it.**

The typical person is a private individual designing their own forest garden. What they lack is know-how, not a tool. So Designer does not just execute: it explains what it sees, it proposes, it shows the reason, and it always leaves the decision to the human. Precision and teamwork are there, but they are not the identity.

Posture: that of a Semisto garden guide, "Come, we'll show you." In French we use the informal "tu", we invite, we never make anyone feel guilty.

## The thread through every detail: the time of living things

A forest garden is designed over thirty years. A 3-year-old walnut has nothing in common with a 25-year-old one. No design tool shows time: Designer shows it everywhere.

In practice, this means:
- **A year slider** (year 1, year 5, year 15, year 30): crowns grow, shade spreads, layers fill in.
- **The seasons**: December shade is not June shade; flowering and harvest have their calendar.
- **The memory of the place**: a map keeps its states (the land on arrival, the plan, what was planted and when). You can always look back at the before.
- **Small touches**: today's date and the season in the header, the age of planted trees, "two winters ago, you planted this apple tree".

## The visual language: a living field notebook

Paper, watercolour, hand-drawn lines and notes, and a map that grows before your eyes.

- **Materials**: a paper background (the design system's light beige), Semisto's multi-layered watercolours, pencil strokes for notes and dimensions.
- **The map stays precise**: under the dressing, geometry is exact (PostGIS, metres). The notebook dresses the data; it never distorts it.
- **Generative drawing serves growth**: growing trees and layers can be computed from the data (species, age, mature height), without becoming the whole style.
- **Movement**: like the wind, not like fireworks (design system). Slow, organic growth rather than interface transitions.
- **The Semisto Design System stays the base** (plum, beige, artichoke; Inter and EB Garamond, never in italics; pill buttons; 16 px cards). This document says what we do with it.

## What we refuse

- The interchangeable SaaS template: a headline, two buttons, a trust strip, "four steps", a six-feature grid, pricing. If a page could sell accounting software, it must be redone.
- Smooth vector illustrations, blue-violet "tech" gradients, stock photos.
- Empty screens that wait. An empty screen is a companion moment: it says what to look at first and why.
- Confusing "done" with "good". What was built fast is not finished until someone has lived it as a user, from one end of the journey to the other.

## How we judge a screen (a checklist for people and agents)

1. **This place**: does the screen speak about the person's own land, or about a generic one?
2. **Time**: can you see, somewhere, that this garden is going to grow?
3. **The companion**: does the screen teach something, or propose the next step with its reason?
4. **The notebook**: does it look like a Semisto field notebook, or like any app?
5. **One step further**: which detail shows we thought of the person before they needed it?

A screen that fails two of these questions is not ready.

## The reference level of boldness

On 5 October 2026, Michael judged a first mock-up (a classic page with a year slider) "interesting but not creative enough". He judged the next concept "excellent": there is no page any more, the screen is the land, and scrolling makes thirty years go by, from the seasons to the mature forest, up to the final pull-back over the neighbouring forest gardens. That is the benchmark: a proposal that stays within the usual structure of a website or an app is not yet at the level.

- Mock-up: https://claude.ai/artifact/ERNV97LHFfjxWz2rF1FZBW
- In the code: the home page (`app/frontend/components/site/timelapse/`).

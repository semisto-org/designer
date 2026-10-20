# Quality notebook: the journeys lived every month

Principle 8 of INTENT.md: done is not the same as good. A feature is finished when someone has lived it as a user from end to end, on a computer and on a phone. This folder is the ritual that keeps that promise after the feature has shipped: six reference journeys, replayed every month, scored on the five questions of the point of view, with every snag written down.

It is Stripe's « friction log » applied to Terranova: someone lives a journey from end to end, notes each snag, and the log is shared and followed up.

## The six journeys

| Id | Journey | Who lives it |
| --- | --- | --- |
| `discover` | Discovering the site: home time-lapse, features, pricing, help, sign-in | a visitor who has never heard of Terranova |
| `first_map` | Creating one's first map: magic link, welcome, new map from an address, the editor opens | a person who has never signed in |
| `invite` | Inviting someone: the share dialog, then the invited person opens the link | the owner of a garden, then a neighbour |
| `pay` | Paying: reaching the free plan's limit, the plans page, checkout, back from Stripe | a free account with one active map |
| `plant` | Planting in the garden: the planting list, a plant's sheet, « Marquer comme planté » | a gardener with a phone in the garden |
| `return` | Coming back after three months: « Mes cartes », the garden, what grew | a garden planted three months ago and not opened since |

Each journey is replayed on a computer (1440 × 900) and a phone (iPhone 13) by `script/journeys.mjs`, which keeps a screenshot of every step. The phone app (`mobile/`) is not replayed by the script: the `plant` journey runs in the web editor on a phone, and the person scoring it also lives it in the app when they can.

## Replaying the journeys

```sh
bin/rails db:prepare db:seed
bin/rails journeys:prepare          # fresh accounts and gardens, ids in tmp/journeys/ids.json
STRIPE_SECRET_KEY=sk_test_journeys STRIPE_PRICE_YEARLY=price_journeys VITE_RUBY_AUTO_BUILD=false bin/rails s
CHROMIUM_PATH=/opt/pw-browsers/chromium node script/journeys.mjs --out tmp/journeys/2026-11
```

The fake Stripe variables turn billing on, so the free plan's limits are real; the script never reaches Stripe (the checkout request comes straight back as after a payment). Address search is answered by the script (Purnode), so the journeys never depend on a geocoder. `--only invite,pay` and `--device phone` replay part of it. The run writes `report.json` next to the screenshots and exits 1 when a step could not be replayed: a broken journey is the first snag of the month.

The « Journeys » GitHub workflow does the same on the first day of each month (and by hand), and keeps the screenshots as an artifact.

## Scoring a journey

Look at the screenshots of both devices as the person would live them, then answer the five questions of `docs/point-of-view.md` for the journey as a whole:

1. **Place** (`place`): does it speak about the person's own land, or about a generic one?
2. **Time** (`time`): can you see, somewhere, that this garden is going to grow?
3. **Companion** (`companion`): does it teach something, or propose the next step with its reason?
4. **Notebook** (`notebook`): does it look like a Semisto field notebook, or like any app?
5. **One step further** (`further`): which detail shows we thought of the person before they needed it?

Each answer is `pass`, `partial` or `fail`, with one sentence of why. Then list the snags, each with the step and device where it shows and a severity:

- **Blocking**: the person cannot finish, or loses what they typed.
- **Major**: the person finishes, but the journey contradicts the point of view (a generic screen, a wall instead of a companion).
- **Minor**: a detail that rubs.

The month's notebook is `docs/quality/YYYY-MM.md`; the scores go into `journeys.yml`, which CI reads. A snag fixed since the previous month is crossed out there with the pull request that fixed it.

## The rule

**A journey that fails two questions blocks new features in its domain until it is fixed.**

`journeys.yml` gives each journey the paths of its domain. On every pull request, the « Journeys gate » step of CI (`script/quality_gate.rb`) fails when the pull request adds a file under the paths of a blocked journey. Changing existing files stays possible, because that is how snags get fixed. A pull request that works on the journey itself (fixing its snags, even with new files) adds the line `Quality: <journey id>` to its description. The block lifts when a new score in `journeys.yml` has fewer than two `fail`, after the journey has been lived again.

## Once a quarter

Four or five people of the core public (former trainees of Semisto's Focus) live one journey in front of us. What they say goes into the month's notebook as it is, next to the scores.

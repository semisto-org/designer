# Semisto — Design System

> **En route vers l'ère des forêts comestibles.**
> Nous transformons l'Europe en un maillage de forêts comestibles — des écosystèmes résilients à impact positif pour la biodiversité, le sol et les humains.

---

## Who is Semisto?

Semisto is a **Belgian ASBL (non-profit)** whose mission is to transform Europe into a mesh of edible forests ("forêts comestibles"). They run formations, participatory planting sites ("chantiers participatifs"), and a design+nursery+academy+heroes ecosystem around food-forest permaculture.

The brand is organised as **four pôles (products)**, each with a signature colour:

| Pôle | Role | Signature colour |
|---|---|---|
| **design** | Landscape & project design studio | Vert artichaud `#afbd00` |
| **academy** | Training, syllabus, formations | Rouge grenade `#b01a19` |
| **nursery** | Living plants, seeds, trees | Orange mangue `#ef9b0d` |
| **heroes** | Community, Food Forest Heroes, volunteers | Bleu myrtille `#234766` |

Secondary pôles mentioned in the charte but with less fixed tokens: **kids** (rose), **edition** (gris-vert), **tools** (olive).

The main brand container itself sits in a **plum / prune** `#5b5781` — the colour of the primary square logo and the typographic heart of the identity.

---

## Sources consulted

- `assets/charte-graphique-2024.pdf` — official charte graphique, 10 pages, dated 11-2024. Covers logo, typography (Allotrope Variable + Sole Serif Small), pôle variants, colour palette, layout principles, document examples.
- `assets/logo-variantes-poles.pdf` — vector-only companion file (no extractable text).
- `uploads/semisto-square-*.png` — six square-format logos on plum, white, academy red, design green, heroes navy, nursery orange backgrounds. Copied into `assets/logo-square-*.png`.
- Brand voice guidelines (pasted in project brief, v3, 2026-04-15) — comprehensive tone, terminology, and channel matrix.

No codebase, Figma, or live website was provided. UI kits are therefore **not** created (see "Caveats" below).

---

## Index (what's in this folder)

| Path | What it is |
|---|---|
| `README.md` | This file — overview, content fundamentals, visual foundations, iconography. |
| `SKILL.md` | Agent-Skill manifest so this folder is portable into Claude Code. |
| `colors_and_type.css` | CSS custom properties + semantic element defaults. Drop-in stylesheet. |
| `assets/` | Logos (plum / white / per-pôle), source PDFs. |
| `preview/` | Small HTML cards that populate the Design System tab — swatches, type specimens, tokens. |
| `fonts/` | (empty) — print fonts (Allotrope Variable, Sole Serif Small) are licensed and not redistributed. See "Typography" below for fallbacks. |

---

## Content fundamentals — how Semisto writes

The voice is **mobilisatrice partout** — mobilising everywhere. Even a quiet, contemplative paragraph about a March forest ends with an invitation to join, plant, or train. Never moralising, never anxiogenic, never in the imperative. The posture is the *guide-jardinier*: **"Viens, on te montre."**

### Person, tone, and register
- **Tutoiement (tu)** by default, everywhere except institutional / fundraising / LinkedIn contexts (vouvoiement there).
- **"Nous"** as the collective voice — not "je", not "l'équipe Semisto".
- **Écriture inclusive** is systematic: *planteur·euse·s, concepteur·rice·s, participant·e·s, citoyen·ne·s, habitant·e·s*.
- **Casing** is lowercase-forward. The logo itself is lowercase ("semisto | food forest"). On socials, **headlines in ALL-CAPS have been officially abandoned** (v3 decision) in favour of normal case with an emoji accroche.
- **French** is the primary language. English appears only in product-lock names ("food forest", "Food Forest Heroes", "kids").

### Vocabulary — terms to use
- *forêt comestible* (primary), *jardin-forêt / forêt-jardin* (synonyms)
- *strates végétales*, *régénérer / régénératif*, *écosystème résilient*, *paysages nourriciers*
- *mycorhizes, biomasse, syntropique / syntropie, BRF*
- *chantier participatif, planteur·euse·s, concepteur·rice·s, abondance*

### Vocabulary — terms to avoid
- *permaculture* alone as a positioning word (OK as hashtag / technical dimension).
- *développement durable* (too corporate), *sensibilisation* (paternalising), *consommateur* (contrary to philosophy).
- Catastrophism, peur, "il est urgent de…", "lutter contre", "combattre".
- "Vous devriez…" — any culpabilising injunction. Prefer the invitation: "Et si tu…", "Viens…".

### Signature phrases
- **"Et si chaque rue, chaque quartier, chaque village d'Europe devenait une forêt comestible ?"** — the founding question.
- **"En route vers l'ère des forêts comestibles"** — tagline.
- **"Rejoins l'aventure Semisto !"** — primary CTA ("aventure", not "projet" or "association").
- **"Tu repars avec des gestes concrets et une vision régénérative."** — training outcome pattern.
- **"Viens, on te montre."** — the essence of the voice.

### Emoji & hashtags (by channel)
- **Site web** — emoji modéré, ponctuel.
- **Newsletter Substack** — almost none; reserved for visual accents.
- **Facebook / Instagram** — abundant: 🌳 🌱 🌿 for plants; 📍 📅 💰 🎟️ for practical info; ✅ for bullets; ✨ 💪 for accents.
- **LinkedIn** — restrained, professional.
- **Fundraising / formal docs** — none.
- **Hashtags** — always at the end of a post, 5–10 per social post, 3–5 on LinkedIn. `#Semisto` is **abandoned** (no discovery value). Use `#JardinForet #ForêtComestible #Agroforesterie #Régénération #SolVivant`.

### Example — Facebook event pattern
```
🌳 Chantier participatif à Beauvechain

Et si on plantait ensemble une forêt comestible ?

✅ Découvrir les strates d'un jardin-forêt
✅ Planter avec Christophe Wautier et Julie Chevolet
✅ Repartir avec des gestes concrets

📍 Beauvechain (Brabant wallon)
📅 Samedi 17 mai, 9h–17h
💰 Prix libre et conscient
🎟️ Inscription : semisto.org/chantier

On a hâte de partager cette journée de terrain avec toi ! 💪

#JardinForêt #ForêtComestible #Beauvechain #ChantierCitoyen #SolVivant
```

---

## Visual foundations

### Palette
A warm, organic palette named after **fruits & vegetables**: Artichaud, Vert lime, Croque-poux, Poire, Citron vif, Mangue, Abricot, Pêche, Orange, Grenade, Framboise, Aubergine, Prune, Myrtille, Mûre. The spectrum moves from yellow-green → yellow → orange → red → pink → purple — exactly the colours of a ripening edible-forest harvest.

The **default brand chrome is the plum / prune** (`#5b5781`) pulled from the primary square logo. Each pôle paints its chrome in its own colour: design green, academy red, nursery orange, heroes navy.

**Backgrounds, per charte:**
> white, beige clair, vert pâle, or a nature photo. **Never** a saturated flat colour background — even a pôle colour is meant to be used against a warm neutral, not wall-to-wall.

### Typography
The web/print split is **intentional** (validated Michael, 2026-04-15).

- **Print / éditions:** Allotrope Variable (sans) @ weight 475, optical spacing +50, and Sole Serif Small @ weight 473. These are licensed; not included in this repo.
- **Web:** Inter (sans), Cera (stencil, branding-only), Cormorant Garamond (serif fallback).
- **Logo wordmark "semisto"** is a warm humanist serif (Sole Serif Small style) in lowercase.
- The tagline "food forest" always sits below in Allotrope sans-serif.

Type personality: **serif for display and poetry, sans for structure and UI, stencil only as a rare branding accent.** Pas d'italique sur le serif (validé Michael, 2026-07) — l'italique de la fonte ne convient pas ; les leads, citations et accents h3 restent en romain (jouer sur corps, graisse et couleur).

**Font fallbacks & substitutions used in this design system:**
- Allotrope Variable → **Inter** (closest weights 400 / 475 / 500 / 600 / 700)
- Sole Serif Small → **Cormorant Garamond** (weights 400 / 475 / 500 / 600) — italique proscrit
- Cera stencil → **Major Mono Display** (closest free monospaced/architectural feel) — **flagged**, not ideal; supply real Cera if available.

### Layout & construction
- The charte's fundamental layout unit is the **"x"** (literally the width and height of the "x" in *Allotrope*). Spacing, reserve, alignment are all multiples of x.
- Logo usage: "semisto" can be on top of an illustration that bleeds off a photo edge ("visu 'à cheval' sur le bord de la photo"). The illustration is **contextualisable** — personalised to a member, a pôle, or the subject of the piece.
- **Visu forêt-jardin**: a watercolour, multi-étagée, profile-view illustration with a white background. Generic unless otherwise specified.
- Grid: the logo itself can "start" a page grid — its column is load-bearing.

### Backgrounds & imagery
- Preferred: **real photography of chantiers, forêts, people in boots**. Warm, natural light, no stylised filters. No corporate stock imagery.
- Illustrations: **watercolour** vibe, multi-layered / étagée, hand-feel, not vector-slick.
- Never: saturated flat-colour full-bleed; neon gradients; bluish-purple tech gradients; corporate photography.

### Borders, shadows, corners
- **Corner radius** is modest — 4px / 8px / 16px and a full pill for tags. The brand reads organic, not rounded-soft-tech.
- **Shadows** are low-key and warm. Prefer a single soft `0 6px 16px rgba(26,26,26,0.10)` over hard drop-shadows or neon glows.
- **Borders** are hair-thin (`rgba(26,26,26,0.10)`). The charte uses a **vertical rule** between the "semisto / food forest" mark and the list of pôles — vertical dividers are a real motif.

### Hover / press
- **Hover**: darken by ~8% or shift from plum to plum-ink. Never neon, never full inversion.
- **Press**: subtle scale `0.98`, or a further 4% darken. No bouncy springs.
- **Focus-visible**: 2px outline in `--semisto-plum`, 2px offset.

### Motion
- Minimal. Short fades (180–220ms), ease-out. No parallax, no theatrical scroll-jacking. The brand is **ancré** — grounded — and motion should read as wind, not fireworks.

### Transparency, blur
- Use sparingly, mostly as **photo protection gradients** (darken a nature photo toward its bottom so white type stays legible). Avoid glassy frosted-UI blur for its own sake.

### Cards
- White background, 16px radius, `--shadow-sm`, `--border-soft` 1px. Content-first. No colored left-border accents (that's an AI-slop tell and Semisto is not that brand).

### Casing
- Page titles, CTAs, and most UI labels are in **lowercase** or sentence case. All-caps is reserved for small eyebrows (kerning opened to `0.12em`).

---

## Iconography

### Observed usage
Semisto's charte does not define an icon system — **the brand's visual vocabulary is carried by photography and watercolour illustration, not icons.** On socials, **emoji stand in as iconography**: 🌳 🌱 🌿 for flora; 📍 📅 💰 🎟️ for practical info blocks; ✅ for bullets; ✨ 💪 as accents.

For product / web UI where emoji would be too casual, we recommend **Lucide** (linked via CDN) — its stroke weight (1.5px, open ends, rounded caps) reads warm and hand-feeling, which matches the illustrated logo mark better than Material or Heroicons' tighter geometry.

> **Substitution flagged:** Lucide is a substitute for any in-house Semisto icon font we have not been supplied with. If Semisto has a library of hand-drawn line icons (likely, given the watercolour illustrations), please share and we'll swap.

### Unicode
Occasionally used as a quiet alternative to emoji in more formal copy: `→ ← · • §`. The charte calls out `0123456789@&§` specifically in its type specimen.

### Imagery checklist
- Logos (plum, white, per-pôle) — in `assets/`.
- Watercolour forest illustrations — **not supplied**; please upload when available. Placeholder behaviour: show the plum square logo.

---

## Caveats & asks

- **No codebase, Figma, or live site was provided.** UI kits (site, app, product chrome) were therefore not created. If you'd like those, please share a Figma link or repo via the Import menu.
- **No watercolour illustrations or photography** were supplied. The brand motif (illustrated jardin-forêt on a photo edge) is described but we cannot instantiate it. Upload a few hero illustrations and 2–3 chantier photos and I'll wire them in.
- **Fruit-&-vegetable palette hex values are best-guess.** The charte lists names only (p.8); RGB / CMJN values appeared as `…` placeholders in extraction. Please audit against the source PDF, or share a tokens file, and I'll update `colors_and_type.css`.
- **Print fonts (Allotrope Variable, Sole Serif Small) are not redistributed.** Web stack uses Inter + Cormorant Garamond as fallbacks. If you have the Allotrope + Sole woff2 files under a license that permits self-hosting, drop them in `fonts/` and I'll wire them up.
- **Cera stencil** has no free equivalent — Major Mono Display is a rough substitute. Flag.
- **No sample deck** was supplied, so the `slides/` folder is not created.

### Clear ask

**I need three things to take this from "solid foundation" to "production-ready":**
1. **Upload the Figma** (or a live URL / screenshots of the site) so I can build a real **ui_kits/website/** kit.
2. **Upload a few watercolour illustrations and 2–3 chantier photos** so the design system has the hero imagery the charte depends on.
3. **Confirm or correct the fruit-&-vegetable palette hex codes** — either by re-sharing p.8 of the PDF or pasting a token list.

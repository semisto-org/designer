# App icon: « Quatre couronnes »

One tree seen from above, as it appears on a map, with its crown at years 1, 5, 15 and 30. Each year is a watercolour wash and a pencil ring drawn by hand (open, the end overshooting the start). It carries the two things the Semisto Designer is about: reading a place from above, and the time of living things. Chosen by Michael on 2026-10-10.

Everything here and every rendered size is drawn by `script/icons.mjs`; edit the script, never the files:

```
CHROMIUM_PATH=/opt/pw-browsers/chromium node script/icons.mjs
ruby script/error_pages.rb   # the error pages inline public/icon.svg
```

| File | Use |
|---|---|
| `app-icon.svg` | Master, full bleed on paper: iOS, iPadOS, Mac (the iPad app runs on Apple silicon Macs with this icon), PWA. |
| `app-icon-android-foreground.svg` | Android adaptive foreground, inside the 66/108 safe circle; background colour `#F7F3EA` in `mobile/app.json`. |
| `app-icon-android-monochrome.svg` | Android 13+ themed icon: rings and the young crown only. |
| `app-icon-crowns.svg` | The crowns alone, for the splash screen. |
| `app-icon-flat.svg` | Plain vector without filters, for small sizes: favicon, `Logo` component, error pages (`public/icon.svg`). |
| `app-icon-macos.png` | The icon on the macOS grid (824 px rounded square with shadow), for a native Mac build or a store listing. |

Colours come from the Semisto Design System: paper `loam-50`, rings `prune-700`, trunk `prune-900`, crowns from `leaf-300` (young leaves at year 30) to a deep forest green (year 1).

#!/usr/bin/env python3
"""Builds the home page time-lapse's watercolour sprites from painted sheets.

The sheets were generated with Magnific (Seedream 5 Pro, a Semisto watercolour
as style reference): 3 x 2 grids of crowns seen from above on white paper. Each
cell is cut out, its white paper turned into transparency (colour-to-alpha, so
the washes stay translucent like real watercolour) and packed into one atlas.

    python3 script/timelapse_sprites.py SHEETS_DIR

SHEETS_DIR holds big.png, fruit.png, shrub.png, pond.png, house.png, bed.png and
meadow.png. Writes atlas.webp, house.webp, bed.webp and meadow.webp into
app/frontend/components/site/timelapse/paint/.
Needs Pillow and numpy.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CELL = 288
# Sprites whose white is paint (blossom), kept opaque inside the crown.
SOLID = {"fruit_blossom"}
OUT = Path(__file__).resolve().parent.parent / "app/frontend/components/site/timelapse/paint"

# Atlas order: must match SPRITES in app/frontend/components/site/timelapse/paint.ts.
GRID = [
    ("big", ["noyer", "noyer_autumn", "tree_bare", "chataignier", "chataignier_autumn", "aulne"]),
    ("fruit", ["fruit", "fruit_blossom", "pommier_fruit", "poirier_fruit", "cerisier_fruit", "fruit_autumn"]),
    ("shrub", ["noisetier", "noisetier_autumn", "small_bare", "cassis", "cassis_fruit", "shrub_bare"]),
]


def to_alpha(rgb: np.ndarray) -> np.ndarray:
    """White paper becomes transparent; darker washes keep their colour and translucency."""
    paper = np.percentile(rgb.reshape(-1, 3), 99, axis=0).clip(200, 255)
    dark = 1 - rgb / paper
    a = dark.max(axis=2).clip(0, 1)
    a = ((a - 0.035) / 0.965).clip(0, 1)
    a = (a * 1.7).clip(0, 1) ** 0.85
    safe = np.where(a > 0, a, 1)[..., None]
    col = (rgb - (1 - a[..., None]) * paper) / safe
    col = np.where(a[..., None] > 0, col, 0).clip(0, 255)
    return np.dstack([col, a * 255]).astype(np.uint8)


def bounds(alpha: np.ndarray):
    """Box of the painted content, ignoring stray specks of paper texture."""
    ink = alpha > 60
    cols = np.nonzero(ink.sum(axis=0) > ink.shape[0] * 0.015)[0]
    rows = np.nonzero(ink.sum(axis=1) > ink.shape[1] * 0.015)[0]
    return cols.min(), cols.max(), rows.min(), rows.max()


def fill_holes(rgba: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    """White flowers are paint, not paper: inside the crown, near-white stays opaque."""
    a = rgba[..., 3]
    m = Image.fromarray(((a > 20) * 255).astype(np.uint8))
    m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    ImageDraw.floodfill(m, (0, 0), 128)
    inside = np.asarray(m) == 255
    out = rgba.copy()
    out[inside, :3] = rgb[inside].astype(np.uint8)
    out[inside, 3] = np.maximum(a[inside], 235)
    return out


def cut(img: Image.Image, box, solid=False) -> Image.Image:
    """A square sprite centred on the painted content of one cell."""
    rgb = np.asarray(img.crop(box).convert("RGB"), dtype=np.float64)
    rgba = to_alpha(rgb)
    if solid:
        rgba = fill_holes(rgba, rgb)
    x0, x1, y0, y1 = bounds(rgba[..., 3])
    side = int(max(x1 - x0, y1 - y0) * 1.04)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    sprite = Image.fromarray(rgba, "RGBA").crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2))
    return sprite.resize((CELL, CELL), Image.LANCZOS)


def cut_rect(img: Image.Image, width: int) -> Image.Image:
    """A sprite cropped to its painted content, keeping its proportions."""
    rgba = to_alpha(np.asarray(img.convert("RGB"), dtype=np.float64))
    x0, x1, y0, y1 = bounds(rgba[..., 3])
    sprite = Image.fromarray(rgba, "RGBA").crop((x0, y0, x1 + 1, y1 + 1))
    return sprite.resize((width, round(sprite.height * width / sprite.width)), Image.LANCZOS)


def main(src: Path):
    sprites = []
    for sheet, names in GRID:
        img = Image.open(src / f"{sheet}.png")
        w, h = img.size
        for i, _ in enumerate(names):
            c, r = i % 3, i // 3
            box = (c * w // 3, r * h // 2, (c + 1) * w // 3, (r + 1) * h // 2)
            sprites.append(cut(img, box, solid=names[i] in SOLID))
    pond = Image.open(src / "pond.png")
    sprites.append(cut(pond, (0, 0, *pond.size)))

    cols = 5
    rows = -(-len(sprites) // cols)
    atlas = Image.new("RGBA", (cols * CELL, rows * CELL), (0, 0, 0, 0))
    for i, s in enumerate(sprites):
        atlas.paste(s, ((i % cols) * CELL, (i // cols) * CELL))
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / "atlas.webp", quality=74, alpha_quality=50, method=6)

    for name, width in (("house", 360), ("bed", 480)):
        cut_rect(Image.open(src / f"{name}.png"), width).save(OUT / f"{name}.webp", quality=78, alpha_quality=60, method=6)

    meadow = Image.open(src / "meadow.png").convert("RGB").resize((1024, 1024), Image.LANCZOS)
    meadow.save(OUT / "meadow.webp", quality=78, method=6)
    print(f"{len(sprites)} sprites, atlas {atlas.size}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))

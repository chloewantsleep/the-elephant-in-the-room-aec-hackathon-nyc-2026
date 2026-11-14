"""Remove the white studio background from product photos -> transparent PNGs.

IKEA product shots sit on pure white. We flood-fill the near-white area that touches the image border
(so white parts *inside* the product survive), fade it out, keep the soft floor shadow as a light
translucent gray, and trim to the product.

    python3 scripts/cutout_tiles.py deck/public/img/tile-*.jpg     # needs Pillow, numpy, scipy
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

SIZE = 640


def cutout(src: Path) -> Path:
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.int16)
    lo, hi = a.min(2), a.max(2)
    # the backdrop is usually pure white but some shots use light gray: sample it from the border
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bgc = np.median(border, axis=0)
    dist = np.abs(a - bgc).max(2)
    # pixels close to the backdrop color (or near-white) with low saturation are background candidates
    cand = ((dist <= 14) | (lo >= 226)) & (hi - lo <= 16)
    lab, _ = ndimage.label(cand)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    # opacity inside the background region: pure white -> 0, light gray shadow -> faint
    ref = min(250, bgc.min())
    fade = np.clip((ref - lo) / 26.0, 0, 1) * 0.55
    alpha = np.where(bg, fade, 1.0)
    # soften the cut edge by 1px
    alpha = ndimage.gaussian_filter(alpha, 0.8)
    alpha = np.where(~bg, 1.0, alpha)
    rgba = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    out = Image.fromarray(rgba)
    box = out.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if box:
        out = out.crop(box)
    out.thumbnail((SIZE, SIZE), Image.LANCZOS)
    # center on a square transparent canvas with a little air
    side = int(max(out.size) * 1.1)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side - out.width) // 2, (side - out.height) // 2))
    dst = src.with_suffix(".png")
    canvas.save(dst, optimize=True)
    return dst


if __name__ == "__main__":
    for p in sys.argv[1:]:
        d = cutout(Path(p))
        print(f"{p} -> {d.name} ({d.stat().st_size // 1024} KB)")

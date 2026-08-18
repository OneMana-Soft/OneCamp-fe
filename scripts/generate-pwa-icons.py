#!/usr/bin/env python3
"""Generate OneCamp's PWA icons from the logo mark, with no image dependencies.

Why this exists rather than a one-off run of ImageMagick: the icons that ship in
public/ are build artefacts of the brand mark, and the numbers that matter (the
maskable safe zone, the stroke proportion) are decisions worth keeping in source
where they can be re-run and reviewed. There is no sharp/PIL/rsvg in this
toolchain, so this writes PNGs directly — stdlib zlib + struct is all it takes.

The mark, from public/logo.svg (512x512 viewBox): a circle stroked #FF4D00 with
r=176 and stroke-width=56, i.e. outer radius 204/512 = 0.3984 of the canvas and a
stroke 56/512 = 0.1094 thick, on a TRANSPARENT canvas.

That transparency is exactly why the previous maskable icons rendered wrong. A
maskable icon is composited into a platform-chosen shape (circle, squircle,
rounded square) and the platform assumes the artwork covers the whole canvas;
76% of these pixels were transparent, so Android drew a thin ring floating on
whatever sat behind the mask. Maskable icons must be full-bleed opaque, and all
content must sit inside the "safe zone": a centred circle of radius 40% of the
canvas, which is the most any mask shape can crop to.

So the maskable variants paint an opaque background and shrink the ring to sit
comfortably inside that safe circle, while apple-touch-icon (which is never mask-
cropped, only squircled) keeps the mark closer to full bleed.
"""

import struct
import zlib
from pathlib import Path

BRAND = (0xFF, 0x4D, 0x00)  # #FF4D00, the mark's orange
CANVAS = (0xFF, 0xFF, 0xFF)  # opaque white, matching manifest background_color
                             # and the light app shell, so launch doesn't flash.

# Proportions of the canvas edge. The source mark is outer=0.3984 / stroke=0.1094.
SAFE_RADIUS = 0.40  # the maskable guarantee; content must stay inside this

# Maskable: pulled in to 0.36 so there is real margin inside the safe circle
# rather than the source mark's 0.0016 of slack.
MASKABLE_OUTER = 0.36
# apple-touch-icon is squircled, not mask-cropped, and iOS adds no padding of its
# own, so a tight-but-not-bleeding 0.42 reads correctly at 60px on a home screen.
APPLE_OUTER = 0.42


def ring_png(size: int, outer_frac: float, maskable: bool) -> bytes:
    """Rasterise the ring on an opaque canvas and encode it as an RGB PNG.

    Stroke thickness scales with the ring so the mark keeps its proportions at
    any outer radius. Edges are supersampled 4x4, but only for pixels close to a
    boundary — the interior and exterior are decided with one distance test, which
    keeps a 512px render fast in pure Python.
    """
    scale = outer_frac / 0.3984  # relative to the source mark
    outer = outer_frac * size
    thickness = 0.1094 * scale * size
    inner = outer - thickness
    # Only the maskable variants owe anything to the safe zone. apple-touch-icon
    # is squircled rather than mask-cropped, so it is deliberately outside it.
    if maskable:
        assert outer <= SAFE_RADIUS * size + 1e-9, (
            f"maskable artwork escapes the safe zone: {outer:.1f}px > {SAFE_RADIUS * size:.1f}px"
        )

    centre = size / 2.0
    rows = bytearray()
    SS = 4  # subsamples per axis
    offsets = [(i + 0.5) / SS for i in range(SS)]

    for y in range(size):
        rows.append(0)  # PNG filter type 0 (None) for this scanline
        dy = y + 0.5 - centre
        for x in range(size):
            dx = x + 0.5 - centre
            d = (dx * dx + dy * dy) ** 0.5
            # Fast path: far enough from both edges that every subsample agrees.
            if d < inner - 1.0 or d > outer + 1.0:
                coverage = 0.0
            elif inner + 1.0 < d < outer - 1.0:
                coverage = 1.0
            else:
                hits = 0
                for oy in offsets:
                    sy = y + oy - centre
                    for ox in offsets:
                        sx = x + ox - centre
                        sd = (sx * sx + sy * sy) ** 0.5
                        if inner <= sd <= outer:
                            hits += 1
                coverage = hits / (SS * SS)
            if coverage <= 0.0:
                rows += bytes(CANVAS)
            elif coverage >= 1.0:
                rows += bytes(BRAND)
            else:
                rows += bytes(
                    round(CANVAS[i] + (BRAND[i] - CANVAS[i]) * coverage) for i in range(3)
                )

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB, no alpha
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    targets = [
        (root / "public/icons/icon-maskable-192.png", 192, MASKABLE_OUTER, True),
        (root / "public/icons/icon-maskable-512.png", 512, MASKABLE_OUTER, True),
        (root / "public/apple-touch-icon.png", 180, APPLE_OUTER, False),
    ]
    for path, size, outer, maskable in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(ring_png(size, outer, maskable))
        kind = "maskable" if maskable else "apple-touch"
        print(f"wrote {path.relative_to(root)} ({size}x{size}, outer={outer:.2f}, {kind})")


if __name__ == "__main__":
    main()

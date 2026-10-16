/** A crop: left, top, width and height, as fractions of the picture (lib/codec/media.ts stores it as "x,y,w,h"). */
export type CropBox = { x: number; y: number; w: number; h: number }

export const FULL_CROP: CropBox = { x: 0, y: 0, w: 1, h: 1 }

/** "x,y,w,h" as the image stores it: at most four decimals, and null for the whole picture. Pure. */
export function cropString(b: CropBox): string | null {
  const f = (v: number) => String(Number(Math.min(1, Math.max(0, v)).toFixed(4)))
  return b.x <= 0.0001 && b.y <= 0.0001 && b.w >= 0.9999 && b.h >= 0.9999 ? null : [b.x, b.y, b.w, b.h].map(f).join(",")
}

/** The stored crop as a box, or the whole picture for none (or one that isn't sound). Pure. */
export function cropBox(s: unknown): CropBox {
  const v = typeof s === "string" ? s.split(",").map(Number) : []
  return v.length === 4 && v.every((n) => n >= 0 && n <= 1) && v[2] > 0 && v[3] > 0 && v[0] + v[2] <= 1.0001 && v[1] + v[3] <= 1.0001
    ? { x: v[0], y: v[1], w: v[2], h: v[3] }
    : FULL_CROP
}

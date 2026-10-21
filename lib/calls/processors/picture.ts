// A picture of someone's own to put behind them in calls. It stays on this
// device: made smaller here (1280 x 720 at most, a JPEG) and kept in this
// browser's storage, never uploaded. In a private window, or when storage is
// full, it lasts until the page closes and the picker says so.

import { BACKDROP_SIZE } from "./effects"

const KEY = "onecamp.call.picture"
/** The most a picture may take in storage, as a data URL. */
export const PICTURE_MAX_CHARS = 1_500_000
/** Pictures the browser can read and that make sense behind someone. */
export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

let kept: string | null = null

/** The picture chosen last, as an image address, or null. */
export function readPicture(): string | null {
  if (kept) return kept
  try {
    const v = window.localStorage.getItem(KEY)
    return v && v.startsWith("data:image/") ? (kept = v) : null
  } catch {
    return null
  }
}

/** Forgets the picture, here and in storage. */
export function forgetPicture(): void {
  kept = null
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing kept */
  }
}

/**
 * The size a picture is drawn at to cover the backdrop's frame, and the
 * part of it that shows, centred. Pure.
 */
export function coverCrop(width: number, height: number, frame = BACKDROP_SIZE): { sx: number; sy: number; sw: number; sh: number } {
  const want = frame.width / frame.height
  const have = width / height
  if (have > want) {
    const sw = Math.round(height * want)
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height }
  }
  const sh = Math.round(width / want)
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh }
}

/**
 * Takes a picture the person chose: checks it is one, makes it the frame's
 * size, keeps it. Says whether it will be there next time. Throws, in words.
 */
export async function keepPicture(file: File): Promise<{ url: string; remembered: boolean }> {
  if (!(PICTURE_TYPES as readonly string[]).includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP picture.")
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That picture couldn't be opened. Try another.")
  })
  const { width: W, height: H } = BACKDROP_SIZE
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext("2d")
  if (!g) throw new Error("This browser can't use a picture of your own.")
  const c = coverCrop(bitmap.width, bitmap.height)
  g.drawImage(bitmap, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H)
  bitmap.close()
  const url = canvas.toDataURL("image/jpeg", 0.85)
  kept = url
  let remembered = false
  if (url.length <= PICTURE_MAX_CHARS) {
    try {
      window.localStorage.setItem(KEY, url)
      remembered = true
    } catch {
      /* this page only */
    }
  }
  return { url, remembered }
}

// A picture to put behind someone in calls: their own, or a scene made from
// their words (meet-09, AiBackground.tsx), each kept in a slot of its own. It stays on this
// device: made smaller here (1280 x 720 at most, a JPEG) and kept in this
// browser's storage, never uploaded. In a private window, or when storage is
// full, it lasts until the page closes and the picker says so.

import { BACKDROP_SIZE } from "./effects"

/** Whose picture: one's own, or a scene made from words. */
export type PictureSlot = "own" | "scene"
const KEYS: Record<PictureSlot, string> = { own: "onecamp.call.picture", scene: "onecamp.call.scene" }
/** The most a picture may take in storage, as a data URL. */
export const PICTURE_MAX_CHARS = 1_500_000
/** Pictures the browser can read and that make sense behind someone. */
export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const

const kept: Partial<Record<PictureSlot, string>> = {}

/** The picture kept last in a slot, as an image address, or null. */
export function readPicture(slot: PictureSlot = "own"): string | null {
  if (kept[slot]) return kept[slot]
  try {
    const v = window.localStorage.getItem(KEYS[slot])
    return v && v.startsWith("data:image/") ? (kept[slot] = v) : null
  } catch {
    return null
  }
}

/** Forgets a slot's picture, here and in storage. */
export function forgetPicture(slot: PictureSlot = "own"): void {
  delete kept[slot]
  try {
    window.localStorage.removeItem(KEYS[slot])
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
 * Takes a picture the person chose, or a scene painted here: checks it is
 * one, makes it the frame's size, keeps it in its slot in place of the one
 * before. Says whether it will be there next time. Throws, in words.
 */
export async function keepPicture(file: File, slot: PictureSlot = "own"): Promise<{ url: string; remembered: boolean }> {
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
  forgetPicture(slot)
  kept[slot] = url
  let remembered = false
  if (url.length <= PICTURE_MAX_CHARS) {
    try {
      window.localStorage.setItem(KEYS[slot], url)
      remembered = true
    } catch {
      /* this page only */
    }
  }
  return { url, remembered }
}

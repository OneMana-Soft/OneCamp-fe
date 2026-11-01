import type { Page } from "@playwright/test"

/**
 * Every face on the call's stage is drawn clear of its tile's name plate, at
 * any tile size: the avatar lies whole inside its tile and off the plate, and
 * a name drawn under the face (when the tile has room for one) never meets
 * the plate's (DESIGN-BUILD-54: a short tile drew the name twice, one over
 * the other, and a phone's strip cut its avatars). No tile carries LiveKit's
 * own label or silhouette, which LiveKit draws in a tile given no contents of
 * its own, and the plate is the one name in a tile that a screen reader meets
 * (DESIGN-BUILD-55: painted over, that label still showed through the plate,
 * and every tile named its person twice). Nor does any tile carry LiveKit's
 * focus toggle, which ParticipantTile draws whatever its contents: it showed
 * behind our pin on a hover or a tap, and was a button in every tile's tab
 * order (DESIGN-BUILD-55). "clear", or the first tile that isn't, by who it
 * is and its size.
 */
export function facesClear(page: Page): Promise<string> {
  return page.evaluate(() => {
    const meets = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    const drawn = (r: DOMRect) => r.width > 0 && r.height > 0
    for (const tile of Array.from(document.querySelectorAll<HTMLElement>("[data-stage-tile]"))) {
      const plate = tile.querySelector<HTMLElement>("[data-name-plate]")
      const t = tile.getBoundingClientRect()
      if (!plate || !drawn(t)) continue
      const at = `in a ${Math.round(t.width)}x${Math.round(t.height)} tile`
      const who = plate.firstElementChild?.textContent?.trim() || "someone"
      // Counted, never looked for on screen: whatever lies under the plate shows through it.
      const lk = tile.querySelectorAll(".lk-participant-metadata, .lk-participant-placeholder").length
      if (lk > 0) return `${who}'s tile carries LiveKit's own label (${lk} parts of it) ${at}`
      // Counted while rendered at all, hovered or not: unhovered it is only see-through, and still takes a Tab.
      const toggles = Array.from(tile.querySelectorAll<HTMLElement>(".lk-focus-toggle-button")).filter((el) => el.checkVisibility()).length
      if (toggles > 0) return `${who}'s tile carries LiveKit's focus toggle ${at}`
      // What a screen reader meets: drawn, and not hidden from it.
      const heard = Array.from(tile.querySelectorAll<HTMLElement>("*")).filter(
        (el) =>
          !el.closest("[aria-hidden=true]") &&
          el.checkVisibility({ visibilityProperty: true }) &&
          Array.from(el.childNodes).some((c) => c.nodeType === Node.TEXT_NODE && c.textContent?.trim() === who),
      )
      if (heard.length > 1) return `${who}'s name is in the tile ${heard.length} times for a screen reader ${at}`
      const face = tile.querySelector<HTMLElement>("[data-camera-off]")
      if (!face) continue
      const p = plate.getBoundingClientRect()
      // The face is the avatar, then the name when it shows one.
      const [avatar, name] = Array.from(face.children) as HTMLElement[]
      const a = avatar.getBoundingClientRect()
      if (a.top < t.top - 0.5 || a.bottom > t.bottom + 0.5 || a.left < t.left - 0.5 || a.right > t.right + 0.5) return `${who}'s avatar runs out of its tile ${at}`
      if (meets(a, p)) return `${who}'s avatar is under the name plate ${at}`
      const n = name?.getBoundingClientRect()
      if (n && drawn(n) && meets(n, p)) return `${who}'s name is drawn twice, one over the other, ${at}`
    }
    return "clear"
  })
}

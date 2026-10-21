// A card's anchor, measured on every ask: the element while it's on the page, else
// what `find` finds in its place, else the last rect that measured. Never (0, 0),
// where an element off the page measures (anchorGuard.test.ts).
type AnchorSource = Element | DOMRectReadOnly | { x: number; y: number } | null | undefined
type AnchorTarget = AnchorSource | (() => AnchorSource)

const live = (s: AnchorSource) => (s instanceof Element && s.isConnected ? s : null)
const rectOf = (s: AnchorSource) => (s instanceof Element ? live(s)?.getBoundingClientRect() : s)

export function anchorTo(target: AnchorTarget, find?: () => Element | null | undefined) {
  let last: DOMRect | null = null
  const now = () => (typeof target === "function" ? target() : target)
  return {
    getBoundingClientRect(): DOMRect {
      for (const source of [now, find]) {
        const r = source && rectOf(source())
        const w = r && "width" in r ? r.width : 0
        const h = r && "height" in r ? r.height : 0
        if (r && (r.x || r.y || w || h)) {
          last = new DOMRect(r.x, r.y, w, h)
          break
        }
      }
      return last ? new DOMRect(last.x, last.y, last.width, last.height) : new DOMRect(innerWidth / 2, innerHeight / 4, 0, 0)
    },
    get contextElement(): Element | undefined {
      return live(now()) ?? live(find?.()) ?? undefined
    },
  }
}

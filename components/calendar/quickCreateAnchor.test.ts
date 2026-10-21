import { afterEach, describe, expect, it } from "vitest"

import { draftAnchorOf } from "@/components/calendar/quickCreateCard"
import { pinTestClock } from "@/lib/testing/testClock"

// A drag across the hours opened New event in the screen's top-left corner
// (20 Oct 2026): the ghost the drag drew unmounted as the drag ended, and the
// card was anchored to what was left of it. jsdom lays nothing out, so each
// element here measures the rect it is given.

function placed(attrs: Record<string, string>, rect: [number, number, number, number], parent: Element = document.body): HTMLElement {
  const el = document.createElement("div")
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.getBoundingClientRect = () => new DOMRect(...rect)
  parent.appendChild(el)
  return el
}

// The dates below are read against a set today (app/testClock.test.ts).
pinTestClock()

const box = (r: DOMRect) => [r.x, r.y, r.width, r.height]
const draft = { start: new Date(2026, 9, 21, 10, 0), end: new Date(2026, 9, 21, 11, 30) }

afterEach(() => {
  document.body.innerHTML = ""
})

describe("where a draft's card stands", () => {
  it("by the ghost the grid draws once the draft is set, though none was there when the drag ended", () => {
    const calendar = placed({ "data-calendar": "" }, [0, 0, 1280, 900])
    // The card is made while the ghost is away (the drag over, the draft not yet drawn).
    const at = draftAnchorOf(draft, null)
    placed({ "data-calendar-ghost": "" }, [512, 336, 140, 82], calendar)
    expect(box(at.getBoundingClientRect())).toEqual([512, 336, 140, 82])
  })

  it("follows the ghost when a parse moves it to another day's column", () => {
    const calendar = placed({ "data-calendar": "" }, [0, 0, 1280, 900])
    const first = placed({ "data-calendar-ghost": "" }, [512, 336, 140, 82], calendar)
    const at = draftAnchorOf(draft, null)
    expect(box(at.getBoundingClientRect())).toEqual([512, 336, 140, 82])
    first.remove()
    placed({ "data-calendar-ghost": "" }, [802, 560, 140, 56], calendar)
    expect(box(at.getBoundingClientRect())).toEqual([802, 560, 140, 56])
  })

  it("by the cell or button it opened from when there's no ghost (the month, the all-day row)", () => {
    placed({ "data-calendar": "" }, [0, 0, 1280, 900])
    const add = placed({}, [300, 120, 20, 20])
    expect(box(draftAnchorOf({ ...draft, allDay: true }, add).getBoundingClientRect())).toEqual([300, 120, 20, 20])
  })

  it("by the draft's day as the month draws it now, once the cell it opened from has gone", () => {
    const gone = document.createElement("div")
    const day = new Date(2026, 9, 21).toISOString()
    placed({ "data-month-day": day }, [640, 400, 160, 120])
    expect(box(draftAnchorOf(draft, gone).getBoundingClientRect())).toEqual([640, 400, 160, 120])
  })

  it("never in the corner, with nothing on the page to stand by", () => {
    const r = draftAnchorOf(draft, null).getBoundingClientRect()
    expect(r.x || r.y).toBeTruthy()
  })
})

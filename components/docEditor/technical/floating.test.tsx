import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, waitFor } from "@testing-library/react"

// The shared popover, in place, keeping the anchor it was given (jsdom lays nothing out).
vi.mock("@/components/ui/popover", () => import("@/lib/testing/popoverAnchor"))

import { anchored } from "@/lib/testing/popoverAnchor"
import { SCREENS, putOnScreen } from "@/lib/testing/screens"
import { openFloating } from "./floating"

// A technical block's panel (a code block's language, an equation, a table's
// menu) stood under its block, read again as the page moved; a block that had
// left the page (a collaborator deleted it) sent the panel 9,999 px off the
// screen, with the focus still in its field. It keeps the last place it was
// seen now (components/ui/anchor), and it is a sheet on a phone by the one
// rule, a phone in landscape too.

let close = () => {}
let offScreen = () => {}
afterEach(async () => {
  await act(async () => close())
  close = () => {}
  offScreen()
  offScreen = () => {}
  anchored.current = null
})

const box = (r: DOMRect) => [r.x, r.y, r.width, r.height]

describe("a technical block's panel", () => {
  it("keeps where its block was last seen once the block has left the page", async () => {
    let place: DOMRect | null = new DOMRect(200, 300, 120, 24)
    await act(async () => {
      close = openFloating(() => <input aria-label="Language" />, { anchor: () => place, label: "Language" })
    })
    expect(box(anchored.current!.getBoundingClientRect())).toEqual([200, 300, 120, 24])
    place = null
    expect(box(anchored.current!.getBoundingClientRect())).toEqual([200, 300, 120, 24])
  })

  it("is a sheet on a phone in landscape, as on one upright", async () => {
    offScreen = putOnScreen(SCREENS["a phone in landscape"])
    await act(async () => {
      close = openFloating(() => <input aria-label="Language" />, { anchor: () => new DOMRect(200, 300, 120, 24), label: "Language", sheetOnPhone: true })
    })
    await waitFor(() => expect(document.querySelector("[data-vaul-drawer] [data-doc-floating-panel], [data-vaul-drawer][data-doc-floating-panel]")).toBeTruthy())
    expect(anchored.current).toBeNull()
  })
})

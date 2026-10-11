import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { PresenceDot, presenceOf, PRESENCE_LABEL, type Presence } from "@/components/ui/presenceDot"

const CSS = readFileSync(join(process.cwd(), "app/hub.css"), "utf8")
afterEach(cleanup)

describe("the presence dot (P4)", () => {
  it("has one style per presence, each with its words", () => {
    for (const p of Object.keys(PRESENCE_LABEL) as Presence[]) {
      const { container } = render(<PresenceDot presence={p} />)
      const dot = container.querySelector("[data-presence]")!
      expect(dot.getAttribute("aria-label")).toBe(PRESENCE_LABEL[p])
      if (p !== "online") expect(CSS).toContain(`.presence-dot[data-presence="${p}"]`)
      cleanup()
    }
  })

  it("draws offline and away hollow, and keeps the surface ring on every state", () => {
    for (const p of ["away", "offline"]) {
      const rule = CSS.slice(CSS.indexOf(`.presence-dot[data-presence="${p}"]`), CSS.indexOf("}", CSS.indexOf(`.presence-dot[data-presence="${p}"]`)))
      expect(rule).toMatch(/inset 0 0 0 1\.5px/)
      expect(rule).toMatch(/0 0 0 2px var\(--presence-ring, var\(--sheet\)\)/)
    }
  })

  it("reads a call, then focus, then online, then away, then offline", () => {
    expect(presenceOf({ status: "online", inCall: true })).toBe("call")
    expect(presenceOf({ status: "online", inFocus: true })).toBe("focus")
    expect(presenceOf({ status: "online", devices: 2 })).toBe("online")
    expect(presenceOf({ status: "online", devices: 0 })).toBe("away")
    expect(presenceOf({ status: "offline" })).toBe("offline")
  })
})

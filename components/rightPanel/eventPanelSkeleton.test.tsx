import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { EventPanelLoading } from "./eventPanelSkeleton"

// V-180: the event panel's shape lived inside the panel's own code, so a cold open on a slow line drew nothing for
// 30 s. It lives beside the shell now: the right panel draws it while the panel's code comes, and the panel draws the
// same shape while its event is read, so the room fills in place.

afterEach(cleanup)

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

describe("the event panel's shape", () => {
  it("holds the panel's room while its code comes: the event's title, calendar and facts at the panel's padding", () => {
    render(<EventPanelLoading />)
    const shape = screen.getByRole("status", { name: "Loading the event" })
    const body = shape.closest("[data-event-panel-loading]")
    expect(body?.className).toContain("px-6")
    // The head, with its live Close, is the right panel's frame (panelFrame.test), drawn once for every panel.
    expect(body?.querySelector("header")).toBeNull()
  })

  it("is the right panel's placeholder for the event panel, and the panel's own while its event is read", () => {
    expect(source("components/rightPanel/rightPanel.tsx")).toMatch(/lazyPanel\(\(\) => loaders\.event\(\)\.then\(\(m\) => m\.default\), "the event", EventPanelLoading\)/)
    const own = source("components/rightPanel/eventInfoPanel.tsx")
    expect(own).toContain('import { EventPanelSkeleton } from "@/components/rightPanel/eventPanelSkeleton"')
    expect(own).not.toMatch(/function EventPanelSkeleton/)
  })
})

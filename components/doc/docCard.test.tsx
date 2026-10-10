import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { hueFor } from "@/lib/campHue"

vi.mock("@/components/doc/docPreview", () => ({ DocPreview: () => <div /> }))

import { DocCard } from "./docCard"

afterEach(cleanup)

const doc = { doc_uuid: "98790bd2-f8f8-4a06-acaa-dc20333831cf", doc_title: "Q4 launch plan", doc_updated_at: "2026-10-09T10:00:00Z" } as never

describe("a doc in the list", () => {
  it("is a link to the doc, so it opens from the keyboard and in a new tab", () => {
    render(<DocCard doc={doc} href="/app/doc/98790bd2-f8f8-4a06-acaa-dc20333831cf" />)
    const link = screen.getByRole("link", { name: /Q4 launch plan/ })
    expect(link.getAttribute("href")).toBe("/app/doc/98790bd2-f8f8-4a06-acaa-dc20333831cf")
  })

  it("wears the doc's own hue, the one it has in the sidebar, and lifts under the pointer", () => {
    const { container } = render(<DocCard doc={doc} href="/x" />)
    expect(container.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor("98790bd2-f8f8-4a06-acaa-dc20333831cf"))
    expect(screen.getByRole("link").className).toMatch(/hover-lift/)
  })
})

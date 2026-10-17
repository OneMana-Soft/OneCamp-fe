import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import "@/components/docEditor/registry"
import { actionGroupsFor } from "@/components/docEditor/registry/readers"
import { createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { MORE_GROUPS } from "@/components/docEditor/actions/doc"

// The doc page's own chrome, read from its source: what a screen reader is
// told, what floats, and where a dead end leads.
// A7"s export items ask the API what this member may export; not here.
vi.mock("@/lib/export/contentIO", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/export/contentIO")>()),
  knownCapabilities: () => null,
  loadCapabilities: async () => null,
}))

const src = readFileSync(join(__dirname, "DocView.tsx"), "utf8")
const header = readFileSync(join(__dirname, "../docEditor/DocHeader.tsx"), "utf8")

describe("the doc page", () => {
  it("names its icon buttons: comments with their count, More, and the focus-mode exit", () => {
    expect(header).toMatch(/aria-label=\{`Comments, \$\{commentCount \|\| 0\}`\}/)
    expect(header).toMatch(/aria-label="More doc actions"/)
    expect(src).toMatch(/aria-label="Exit focus mode"/)
  })

  it("keeps the occasional actions in More, and Share as the one secondary button", () => {
    // More draws what is registered for it (components/docEditor/actions).
    expect(header).toMatch(/actionGroupsFor\("more", actions\(\), MORE_GROUPS\)/)
    const ctx = { docId: "d", editor: {} as never, canEdit: true, bus: createDocCommandBus("d"), gate: { ai: false }, state: { desktop: true } }
    const more = actionGroupsFor("more", ctx, MORE_GROUPS).flatMap((g) => g.actions.map((a) => a.label))
    for (const item of ["Save for later", "Focus mode", "Full width", "Version history", "Viewed by", "Export as Markdown", "Keyboard shortcuts"]) {
      expect(more).toContain(item)
    }
    expect(header).toMatch(/<Button variant="secondary" size="sm" onClick=\{onShare\}/)
  })

  it("shows its header hairline only once the body has scrolled", () => {
    expect(header).toMatch(/after:opacity-0/)
    expect(header).toMatch(/scrolled && "after:opacity-100"/)
  })

  it("says how it is saving with a dot, not a footer or a banner", () => {
    expect(header).toMatch(/<SaveDot /)
    expect(src).not.toMatch(/Connecting to the live editor/)
    expect(src).toMatch(/<ConnectionPill /)
  })

  // Review, 15 Oct 2026: the page read the saves (twice), which change with
  // every key, so the page and its header rendered again two to four times a
  // key, about 340 components a key in a 12-block doc (I20). The dot reads them.
  it("leaves the saves to the dot: neither the page nor the header reads them", () => {
    expect(src).not.toMatch(/useSaveProgress\(|useSlowSave\(|useDocSaveDot\(/)
    const body = header.slice(header.indexOf("export function DocHeader("))
    expect(body.slice(0, body.indexOf("\n}\n"))).not.toMatch(/useSaveProgress\(|useSlowSave\(|useDocSaveDot\(/)
    const dot = header.slice(header.indexOf("function DocSaveDot("))
    expect(dot.slice(0, dot.indexOf("\n}\n"))).toMatch(/useDocSaveDot\(source\)/)
  })

  it("offers a way back from a doc that isn't there, instead of a bare sentence", () => {
    expect(src).not.toMatch(/Document not found or access denied/)
    const missing = src.slice(src.indexOf("if (!docInfo)"), src.indexOf('data-doc-view=""'))
    expect(missing).toMatch(/<LoadFailureState kind="gone" noun="doc"/)
    expect(missing).toMatch(/href: "\/app\/doc"/)
  })

  it("floats the focus-mode exit on e3, fading while the pointer rests", () => {
    expect(src).not.toMatch(/shadow-lg/)
    expect(src).toMatch(/className="bg-pop shadow-e3"/)
    expect(src).toMatch(/focusChrome \? "opacity-100" : "opacity-0"/)
    expect(src).not.toMatch(/transition duration-300/)
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// The evidence pack opens full-window from the audit log, and it had no way
// back: an admin reached Admin again only through the browser's Back or the
// sidebar. Every state now has the page frame's breadcrumb back to the audit
// log. Design v3 (A12): it is a document, so its fingerprint sits on one
// line with a middle ellipsis (the whole value in its title and in print),
// and @media print rules strip the frame and print every digest in full.

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))
const plan = vi.hoisted(() => ({ locked: false }))
vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({ freePlan: plan.locked, isLocked: () => plan.locked, upgradeUrl: undefined }),
}))
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getEvidencePack: (...a: unknown[]) => api.get(...a),
  downloadEvidencePack: vi.fn(),
}))
vi.mock("@/components/admin/EvidencePackView", () => ({ default: () => <article>the pack</article> }))

const { default: EvidencePackPage } = await import("./page")
const AUDIT_LOG_HREF = "/app/admin?tab=audit"

afterEach(() => {
  cleanup()
  plan.locked = false
  api.get.mockReset()
})

const wayBack = () => screen.getByRole("link", { name: "Audit log" })

describe("the evidence pack page", () => {
  it("has a way back to the audit log while it reads the pack", async () => {
    api.get.mockResolvedValue({ pack: {} })
    render(<EvidencePackPage />)
    expect(await screen.findByText("the pack")).toBeTruthy()
    expect(wayBack().getAttribute("href")).toBe(AUDIT_LOG_HREF)
  })

  it("has the way back on the free plan, beside the reason it's locked", () => {
    plan.locked = true
    api.get.mockResolvedValue(null)
    render(<EvidencePackPage />)
    expect(wayBack().getAttribute("href")).toBe(AUDIT_LOG_HREF)
    expect(screen.getByRole("heading", { name: "Evidence packs come with a licence" })).toBeTruthy()
  })

  it("has the way back when the pack couldn't be read, beside Try again", async () => {
    api.get.mockRejectedValue(new Error("503"))
    await act(async () => void render(<EvidencePackPage />))
    expect(await screen.findByText("Couldn't load the evidence pack")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(wayBack().getAttribute("href")).toBe(AUDIT_LOG_HREF)
  })
})

describe("the evidence pack as a document", () => {
  it("writes the fingerprint on one line with a middle ellipsis, the whole value in its title and for print", async () => {
    const { Fingerprint } = await vi.importActual<typeof import("@/components/admin/EvidencePackView")>("@/components/admin/EvidencePackView")
    const fp = "4dfe57e3a1b2c3d4e5f60718293a4b5c6d7e8f9012345678972dd554ee"
    const { container } = render(<Fingerprint value={fp} copy={false} />)
    const short = container.querySelector(".ev-short") as HTMLElement
    expect(short.textContent).toBe("4dfe57e3…72dd554ee")
    expect(short.getAttribute("title")).toBe(fp)
    expect(container.querySelector(".ev-full")?.textContent).toBe(fp)
    expect(short.className).toContain("truncate")
  })

  it("has print rules: no frame, black ink, every fingerprint in full, a page per section", async () => {
    const { readFileSync } = await import("node:fs")
    const css = readFileSync("app/styles/admin/people.css", "utf8")
    const print = css.slice(css.indexOf("@media print"))
    expect(print).toMatch(/\[data-page-header\][^{]*\{[^}]*display: none/)
    expect(print).toMatch(/color: #000/)
    expect(print).toMatch(/\.ev-short \{[^}]*display: none/)
    expect(print).toMatch(/\.ev-full \{[^}]*display: inline/)
    expect(print).toMatch(/break-before: page/)
    // On screen the full value is hidden: one line, never wrapping across three.
    expect(css.slice(0, css.indexOf("@media print"))).toMatch(/\.ev-full \{\s*display: none;/)
  })

  it("keeps its breadcrumb back to the audit log above the title", async () => {
    api.get.mockResolvedValue({ pack: {} })
    render(<EvidencePackPage />)
    await screen.findByText("the pack")
    const crumb = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(crumb.textContent).toContain("Evidence pack")
    expect(screen.getByRole("heading", { level: 1, name: "Evidence pack" })).toBeTruthy()
  })
})

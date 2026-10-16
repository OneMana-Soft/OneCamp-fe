import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { SystemCheckReport } from "@/services/systemCheckService"

// Design v3, admin A21 (mock M8): calm, legible health is what a self-hoster
// opens first when something feels off.
//
// - The ring's share IS the healthy share: 9 of 10 healthy fills 90 %, never
//   a decorative full ring beside a red count.
// - A tile that needs attention spans both columns and carries its reason
//   and its fix as a code row to copy, instead of ten lines of grey prose.
// - A new result crossfades two stacked rings (opacity); the ring's dash is
//   never transitioned (app/motionCost.test.ts).

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))
const runSystemCheck = vi.fn()
vi.mock("@/services/systemCheckService", () => ({ runSystemCheck: () => runSystemCheck() }))

const { default: SystemCheckCard, fixOf, diskUsed, checkTitle } = await import("./SystemCheckCard")
const { healthShare } = await import("./HealthRing")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const renderCard = () => render(<TooltipProvider><SystemCheckCard /></TooltipProvider>)

const ok = (name: string, took = 3) => ({ name, kind: "dependency" as const, describe: `${name} answers.`, healthy: true, took_ms: took })
const nine = Array.from({ length: 9 }, (_, i) => ok(["database", "graph", "cache", "realtime", "storage", "search", "email", "sign-in", "accounts"][i]))
const report = (over: Partial<SystemCheckReport> = {}): SystemCheckReport => ({
  healthy: 9,
  unhealthy: 1,
  total: 10,
  checked_at: 1_757_000_000,
  checks: [
    ...nine,
    {
      name: "Disk",
      kind: "dependency",
      describe: "How full the server's disk is.",
      healthy: false,
      detail: 'disk 96% used, 2.1 GB free: the database stops accepting writes near here. Free room now: remove old files with "Remove for good" (Admin, then Archive), and on the server run make housekeeping',
      took_ms: 1,
    },
  ],
  ...over,
})

afterEach(() => {
  cleanup()
  runSystemCheck.mockReset()
})

describe("the health ring", () => {
  it("fills to healthy over total", async () => {
    expect(healthShare(9, 10)).toBe(0.9)
    expect(healthShare(0, 0)).toBe(0)
    runSystemCheck.mockResolvedValue(report())
    renderCard()
    await screen.findByText("1 needs attention")
    const ring = document.querySelector("[data-health-ring]") as HTMLElement
    expect(Number(ring.getAttribute("data-share"))).toBe(0.9)
    const bar = ring.querySelector('[role="progressbar"][aria-label="9 of 10 healthy"]') as HTMLElement
    expect(bar.getAttribute("aria-valuenow")).toBe("90")
    expect(ring.textContent).toContain("9/10")
    // A service this install needs is down, so the remainder is danger.
    expect(ring.querySelector(".cfg-ring-rest-danger")).toBeTruthy()
  })

  it("crossfades a new result over the old with two stacked rings", async () => {
    runSystemCheck.mockResolvedValueOnce(report()).mockResolvedValueOnce(report({ healthy: 10, unhealthy: 0, checks: [...nine, ok("Disk")] }))
    renderCard()
    await screen.findByText("1 needs attention")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Run again" })))
    await screen.findByText("All 10 healthy")
    const layers = document.querySelectorAll("[data-health-ring] [data-ring-layer]")
    expect(layers).toHaveLength(2)
    expect(layers[0].getAttribute("data-gone")).toBe("true")
    expect(layers[1].getAttribute("data-fresh")).toBe("true")
  })

  it("never transitions the ring's dash in the slice's styles", () => {
    const css = readFileSync(join(process.cwd(), "app/styles/admin/config.css"), "utf8")
    expect(css).not.toMatch(/transition[^;]*stroke-dash/)
    expect(css).toMatch(/\[data-ring-layer\][^{]*\{[^}]*transition:\s*opacity 300ms/)
  })
})

describe("a tile's tone", () => {
  // Critic, 11 Oct: a failing feature (the GitHub sync queue) drew its tile in
  // danger beside a ring whose remainder was sun for it. The tile follows the
  // ring: a service down is danger, a feature failing quietly is sun.
  it("is danger for a service that is down and sun for a feature that fails", async () => {
    const { needsAttention } = await import("@/components/admin/SystemCheckCard")
    const base = { name: "x", describe: "", healthy: false, took_ms: 1 }
    expect(needsAttention({ ...base, kind: "dependency" } as never)).toBe("danger")
    expect(needsAttention({ ...base, kind: "behaviour" } as never)).toBe("warning")
    expect(needsAttention({ ...base, kind: "behaviour", healthy: true } as never)).toBeNull()
  })
})

describe("service tiles", () => {
  it("spans both columns for a tile that needs attention, with its reason and fix", async () => {
    runSystemCheck.mockResolvedValue(report())
    renderCard()
    await screen.findByText("1 needs attention")
    const tiles = Array.from(document.querySelectorAll("[data-service-tile]"))
    expect(tiles).toHaveLength(10)
    const disk = tiles.find((t) => t.textContent?.includes("Disk")) as HTMLElement
    expect(disk.getAttribute("data-attention")).toBe("danger")
    expect(disk.className).toMatch(/sm:col-span-2/)
    expect(disk.textContent).toMatch(/stops accepting writes/)
    expect(disk.querySelector("[data-code-row] code")?.textContent).toBe("make housekeeping")
    // Healthy tiles stay calm: one column, no reason, no fix.
    const db = tiles.find((t) => t.textContent?.includes("Database")) as HTMLElement
    expect(db.className).not.toMatch(/col-span-2/)
    expect(db.querySelector("[data-code-row]")).toBeNull()
  })

  it("draws the disk's use as a 4px bar, sun to 95 %, danger above", async () => {
    runSystemCheck.mockResolvedValue(report())
    renderCard()
    await screen.findByText("1 needs attention")
    const bar = document.querySelector("[data-disk-bar]") as HTMLElement
    expect(bar.getAttribute("aria-label")).toBe("96% used")
    expect(bar.firstElementChild?.className).toBe("bg-destructive")
    expect(diskUsed({ ...nine[0], detail: "disk 90% used" })).toBe(90)
  })

  it("turns each dot into a spinner while it runs again, and staggers the results", async () => {
    runSystemCheck.mockResolvedValueOnce(report()).mockReturnValueOnce(new Promise(() => {}))
    renderCard()
    await screen.findByText("1 needs attention")
    const results = Array.from(document.querySelectorAll(".cfg-tile-result")) as HTMLElement[]
    expect(results.map((r) => r.style.getPropertyValue("--i"))).toEqual(results.map((_, i) => String(i)))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Run again" })))
    expect(screen.getAllByLabelText("Checking")).toHaveLength(10)
  })
})

describe("reading a check", () => {
  it("names checks as people say them, and finds the command in a reason", () => {
    expect(checkTitle("github-sync")).toBe("GitHub sync")
    expect(checkTitle("entity-links")).toBe("Entity links")
    expect(fixOf({ ...nine[0], detail: "the queue is stuck; run go-one-camp requeue --all." })).toBe("go-one-camp requeue --all")
    expect(fixOf({ ...nine[0], detail: "nothing to run here" })).toBeNull()
  })
})

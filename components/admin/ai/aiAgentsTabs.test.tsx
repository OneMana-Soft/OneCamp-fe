import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// AI & agents was one 7,000px column; it is six sub-pages under a tab bar
// (design v3, admin §A15). The sub-page is in the URL, and the ids the section
// always had (#ai-models-drill and the rest, in links in the wild, Search
// settings and the consent page) still land: each opens the sub-page that
// holds its card, and the card flashes.

const params = vi.hoisted(() => ({ value: new URLSearchParams("tab=ai-models") }))
const replace = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  useSearchParams: () => params.value,
  useRouter: () => ({ replace }),
  usePathname: () => "/app/admin",
}))
// Each sub-page stands in as its cards' anchors.
const card = (id: string) => (
  <section key={id} id={id}>
    <div data-settings-card="">{id}</div>
  </section>
)
vi.mock("@/components/admin/ai/tabs/OverviewTab", () => ({ default: () => <div>{card("ai-models-status")}</div> }))
vi.mock("@/components/admin/ai/tabs/ModelsTab", () => ({ default: () => <div>{["ai-models-models", "ai-models-routing"].map(card)}</div> }))
vi.mock("@/components/admin/ai/tabs/AgentsTab", () => ({ default: () => <div>{["ai-models-inventory", "ai-models-delegation"].map(card)}</div> }))
vi.mock("@/components/admin/ai/tabs/GovernanceTab", () => ({ default: () => <div>{["ai-models-drill", "ai-models-mcp"].map(card)}</div> }))
vi.mock("@/components/admin/ai/tabs/UsageTab", () => ({ default: () => <div>{card("ai-models-activity")}</div> }))
vi.mock("@/components/admin/ai/tabs/AdvancedTab", () => ({ default: () => <div>{card("ai-models-sandbox")}</div> }))

import AIAgentsSection from "@/components/admin/ai/AIAgentsSection"
import { AI_CARD_TAB, AI_SUBTABS, aiSubTabFor } from "@/components/admin/ai/aiTabs"

const OLD_JUMPS: Record<string, string> = {
  "ai-models-models": "models",
  "ai-models-routing": "models",
  "ai-models-inventory": "agents",
  "ai-models-delegation": "agents",
  "ai-models-drill": "governance",
  "ai-models-mcp": "governance",
  "ai-models-activity": "usage",
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  window.history.replaceState(null, "", "/app/admin?tab=ai-models")
})
afterEach(() => {
  cleanup()
  replace.mockClear()
  params.value = new URLSearchParams("tab=ai-models")
})

const selected = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent

describe("AI & agents' sub-pages", () => {
  it("has the six tabs, in order, opening on Overview", async () => {
    render(<AIAgentsSection />)
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Models", "Agents", "Governance", "Usage", "Advanced"])
    expect(selected()).toBe("Overview")
    expect(await screen.findByText("ai-models-status")).toBeTruthy()
  })

  it("draws one underline that moves by transform", () => {
    const { container } = render(<AIAgentsSection />)
    expect(container.querySelectorAll("[data-ai-tab-ink]")).toHaveLength(1)
    const css = readFileSync(join(process.cwd(), "app/styles/admin/ai.css"), "utf8")
    const rule = css.slice(css.indexOf(".ai-tab-ink {"), css.indexOf("}", css.indexOf(".ai-tab-ink {")))
    expect(rule).toMatch(/transition: transform 220ms var\(--ease-spring\)/)
    expect(rule).not.toMatch(/transition:[^;]*\b(left|width)\b/)
  })

  it("holds the chosen tab in the URL", async () => {
    render(<AIAgentsSection />)
    const tab = screen.getByRole("tab", { name: "Governance" })
    fireEvent.mouseDown(tab)
    fireEvent.click(tab)
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/admin?tab=ai-models&sub=governance", { scroll: false }))
    expect(await screen.findByText("ai-models-drill")).toBeTruthy()
  })

  it("opens the tab ?sub= names", async () => {
    params.value = new URLSearchParams("tab=ai-models&sub=advanced")
    render(<AIAgentsSection />)
    expect(selected()).toBe("Advanced")
  })

  it("maps every old jump id to the sub-page that holds its card", () => {
    for (const [id, tab] of Object.entries(OLD_JUMPS)) {
      expect(AI_CARD_TAB[id]).toBe(tab)
      expect(aiSubTabFor(null, `#${id}`)).toBe(tab)
    }
    // Every id maps to a tab that exists.
    for (const tab of Object.values(AI_CARD_TAB)) expect(AI_SUBTABS.map((t) => t.value)).toContain(tab)
    // A card wins over ?sub=, and nonsense falls back to Overview.
    expect(aiSubTabFor("usage", "#ai-models-drill")).toBe("governance")
    expect(aiSubTabFor("nonsense", "")).toBe("overview")
  })

  it("opens a cold link to a card on its sub-page", async () => {
    window.history.replaceState(null, "", "/app/admin?tab=ai-models#ai-models-drill")
    render(<AIAgentsSection />)
    expect(selected()).toBe("Governance")
    expect(await screen.findByText("ai-models-drill")).toBeTruthy()
  })

  it("moves to the card's sub-page on a jump while open, and flashes the card", async () => {
    render(<AIAgentsSection />)
    await screen.findByText("ai-models-status")
    await act(async () => {
      window.history.replaceState(null, "", "/app/admin?tab=ai-models#ai-models-routing")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(selected()).toBe("Models")
    const target = await screen.findByText("ai-models-routing")
    await waitFor(() => expect(target.classList.contains("set-flash")).toBe(true))
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"

import type { ProjectOverview } from "@/lib/projectsOverview"
import type { ProjectPlan } from "@/lib/work/projectPlan"
import { resetGrowForTests } from "@/hooks/useGrow"
import { pinTestClock } from "@/lib/testing/testClock"

// linear-15 (DB-93's verdict, 2 Nov): the projects timeline shows each project's lead by their face at its bar's
// end, and its lead, priority and labels in the bar's tip under a pointer. On a touch screen, where nothing hovers,
// a tap opens them in a peek that leads on to the project's timeline; a mouse's click still follows the bar's link.

const touch = vi.hoisted(() => ({ on: false }))
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }))
// The milestones' diamonds come in a chunk of their own: none here.
vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("@/lib/ui/touchScreen", async (actual) => ({ ...(await actual<typeof import("@/lib/ui/touchScreen")>()), isTouchScreen: () => touch.on }))

import { ProjectsTimeline } from "@/components/project/ProjectsTimeline"

const plan = (o: Partial<ProjectPlan> = {}): ProjectPlan => ({
  lead: null,
  start: { date: "2026-10-01", resolution: "month" },
  target: { date: "2026-11-30", resolution: "month" },
  priority: "",
  status: { category: "in_progress", name: "In progress", color: "" },
  labels: null,
  ...o,
})
const project = (id: string, name: string, p: ProjectPlan): ProjectOverview => ({ project_uuid: id, project_name: name, is_admin: 1, open: 3, done: 1, overdue: 0, due_soon: 0, plan: p })
const BILLING = project(
  "p-billing",
  "Billing revamp",
  plan({
    lead: { user_uuid: "u1", name: "Ana Diaz" },
    priority: "urgent",
    labels: [
      { id: "l1", name: "Revenue", color: "emerald" },
      { id: "l2", name: "Q4 bet", color: "slate" },
    ],
  }),
)
const AUDIT = project("p-audit", "Audit prep", plan())
const bar = (id: string) => document.querySelector<HTMLElement>(`[data-project-bar="${id}"]`)!
const faceOf = (id: string) => bar(id).parentElement!.querySelector<HTMLElement>("[data-plan-lead]")
/** Clicks el and says whether the click goes on to follow its link (nothing prevented it); jsdom never navigates. */
function follows(el: HTMLElement): boolean {
  let followed = false
  const see = (e: Event) => {
    followed = !e.defaultPrevented
    e.preventDefault()
  }
  document.addEventListener("click", see, { once: true })
  fireEvent.click(el)
  return followed
}

pinTestClock()
beforeEach(() => {
  window.localStorage.clear()
  resetGrowForTests()
})
afterEach(() => {
  cleanup()
  touch.on = false
})

describe("the projects timeline names each project's lead, priority and labels (linear-15)", () => {
  it("draws the lead's face at the bar's end, and says the lead, priority and labels in the bar's name and its tip", () => {
    render(<ProjectsTimeline projects={[BILLING, AUDIT]} />)
    const label = bar("p-billing").getAttribute("aria-label")!
    expect(label).toMatch(/^Billing revamp, .+, led by Ana Diaz, Urgent priority, labels Revenue, Q4 bet, 25% done$/)
    expect(bar("p-billing").getAttribute("data-tip")).toBe(label)
    // The face every screen draws Ana with, after the bar's end, beside its share done.
    expect(faceOf("p-billing")?.textContent).toBe("A")
    expect(faceOf("p-billing")?.parentElement?.textContent).toBe("A25%")
    // A plan with no lead, priority or labels says none of them, and draws no face.
    expect(bar("p-audit").getAttribute("aria-label")).toMatch(/^Audit prep, [^,]+, 25% done$/)
    expect(faceOf("p-audit")).toBeNull()
  })

  it("on a touch screen, a tap on a bar opens its plan in a peek that leads on to its timeline, and goes nowhere itself", () => {
    touch.on = true
    render(<ProjectsTimeline projects={[BILLING, AUDIT]} />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(follows(bar("p-billing")), "the tap doesn't follow the link").toBe(false)
    // The peek is named by its project, as a screen reader announces it.
    const peek = screen.getByRole("dialog", { name: "Billing revamp" })
    expect(peek).toHaveAttribute("data-plan-peek")
    expect(within(peek).getByText("Billing revamp")).toBeTruthy()
    expect(within(peek).getByText("Ana Diaz")).toBeTruthy()
    expect(within(peek).getByText("Urgent")).toBeTruthy()
    expect(within(peek).getAllByText(/^(Revenue|Q4 bet)$/).map((n) => n.textContent)).toEqual(["Revenue", "Q4 bet"])
    expect(within(peek).getByRole("link", { name: "Open timeline" })).toHaveAttribute("href", expect.stringContaining("p-billing?tab=timeline"))
    fireEvent.keyDown(peek, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()

    // A plan without them says so, in quiet words.
    follows(bar("p-audit"))
    const none = screen.getByRole("dialog")
    for (const words of ["No lead", "No priority", "No labels"]) expect(within(none).getByText(words)).toBeTruthy()
  })

  it("under a mouse, a click follows the bar's link and opens no peek", () => {
    render(<ProjectsTimeline projects={[BILLING]} />)
    expect(follows(bar("p-billing")), "the click follows the link").toBe(true)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})

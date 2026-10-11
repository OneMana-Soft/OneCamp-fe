import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ImportJobRow, ImportStatusChip, isWaiting } from "./ImportJobRow"
import type { ImportJob } from "@/services/importService"

afterEach(cleanup)

const job = (status: ImportJob["status"], over: Partial<ImportJob> = {}): ImportJob => ({
  id: "j1",
  provider: "jira",
  source_workspace_name: "Acme",
  source: "api",
  status,
  options: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  chunks_total: 4,
  chunks_done: 2,
  chunks_failed: 0,
  items_imported: 120,
  errors_total: 0,
  ...over,
})

const handlers = () => ({
  onPlan: vi.fn(),
  onDiscard: vi.fn(),
  onCancel: vi.fn(),
  onRollback: vi.fn(),
  onRetryFailed: vi.fn(),
  onInvite: vi.fn(),
  onShowErrors: vi.fn(),
})

const buttons = () => screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim())
// A done import keeps what's left behind ⋯ (design v3, §A14): opens it, and
// returns its items' names.
const menu = (name = "More for Acme") => {
  fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" })
  return screen.getAllByRole("menuitem").map((m) => m.textContent?.trim())
}

describe("an import job's way forward", () => {
  // A waiting job used to have none: Cancel only stopped a running one, and
  // the waiting job kept its workspace's label busy.
  it("can be planned or discarded while it waits", () => {
    for (const status of ["validating", "planned"] as const) {
      const h = handlers()
      render(<ImportJobRow job={job(status)} {...h} />)
      expect(buttons()).toEqual(["Plan", "Discard"])
      fireEvent.click(screen.getByRole("button", { name: "Discard" }))
      expect(h.onDiscard).toHaveBeenCalledOnce()
      cleanup()
    }
    render(<ImportJobRow job={job("pending")} {...handlers()} />)
    expect(buttons()).toEqual(["Discard"])
    expect(isWaiting("pending") && isWaiting("validating") && isWaiting("planned") && !isWaiting("running")).toBe(true)
  })

  it("can be planned again once it failed, and says why it failed", () => {
    const h = handlers()
    render(<ImportJobRow job={job("failed", { error_message: "Jira didn't accept that email and API token.", chunks_failed: 1 })} {...h} />)
    expect(buttons()).toEqual(["Plan again", "More for Acme"])
    expect(screen.getByText("Jira didn't accept that email and API token.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Plan again" }))
    expect(h.onPlan).toHaveBeenCalledOnce()
    expect(menu()).toEqual(["Retry the failed parts", "Roll back"])
  })

  it("offers the people who came across once it finished, and can be cancelled while it runs", () => {
    const h = handlers()
    render(<ImportJobRow job={job("completed")} {...h} />)
    expect(buttons()).toEqual(["More for Acme"])
    expect(screen.getByText("Finished")).toBeTruthy()
    expect(menu()).toEqual(["Invite the people who came across", "Roll back"])
    fireEvent.click(screen.getByRole("menuitem", { name: /Invite the people/ }))
    expect(h.onInvite).toHaveBeenCalledOnce()
    cleanup()
    render(<ImportJobRow job={job("running", { stage: "tasks" })} {...handlers()} />)
    expect(buttons()).toEqual(["Cancel"])
    expect(screen.getByText(/tasks/)).toBeTruthy()
  })

  it("names the provider in a list of every provider's jobs", () => {
    render(<ImportJobRow job={job("completed", { provider: "monday" })} showProvider {...handlers()} />)
    expect(screen.getByText(/monday\.com ·/)).toBeTruthy()
  })
})

describe("how an import job reads", () => {
  // Status was drawn in raw blue, indigo, purple and grey, which measure
  // 2.3 to 3.5:1 in dark mode, below AA, each with an icon beside the word.
  it("says where it stands in status tokens, with no icon", () => {
    for (const status of ["pending", "validating", "planned", "running", "paused", "completed", "failed", "cancelled", "rolled_back"] as const) {
      const { container } = render(<ImportStatusChip status={status} />)
      const chip = container.firstElementChild as HTMLElement
      expect(chip.className).not.toMatch(/\b(?:bg|text|border)-(?:blue|indigo|purple|gray)-\d/)
      expect(chip.querySelector("svg")).toBeNull()
      cleanup()
    }
  })

  // The bar's status: a dot and a word, the word in ink. It was a tinted pill.
  // Design v3 (§1.4): the connect slice's StateWord; Running pulses its dot.
  it("says where it stands as a dot and a word", () => {
    const { container } = render(<ImportStatusChip status="completed" />)
    const word = container.querySelector("[data-state-word]") as HTMLElement
    expect(word.getAttribute("data-state-word")).toBe("success")
    expect(word.textContent).toBe("Finished")
    expect(word.className).not.toMatch(/border|bg-success\/10|rounded-sm/)
    cleanup()
    const failed = render(<ImportStatusChip status="failed" />)
    expect(failed.container.querySelector("[data-state-word]")?.getAttribute("data-state-word")).toBe("danger")
    cleanup()
    const run = render(<ImportStatusChip status="running" />)
    expect(run.container.querySelector("[data-state-word]")?.getAttribute("data-state-word")).toBe("warning")
    expect(run.container.querySelector('[data-pulse="true"]')).toBeTruthy()
    cleanup()
    const back = render(<ImportStatusChip status="rolled_back" />)
    expect(back.container.querySelector("[data-state-word]")?.getAttribute("data-state-word")).toBe("neutral")
  })

  // One primary action per view: the next step on each row was a filled
  // orange button, so a list of three imports drew three.
  it("offers each row's next step as an outline button", () => {
    render(<ImportJobRow job={job("planned")} {...handlers()} />)
    expect(screen.getByRole("button", { name: "Plan" }).className).not.toContain("bg-primary")
    cleanup()
    render(<ImportJobRow job={job("failed")} {...handlers()} />)
    expect(screen.getByRole("button", { name: "Plan again" }).className).not.toContain("bg-brand")
  })

  // A running import shows how far it got as a 160px bar whose fill scales on
  // X (never its width), and no ⋯: there is nothing to do but wait or cancel.
  it("draws a running import's progress by scaleX, and no menu", () => {
    render(<ImportJobRow job={job("running")} {...handlers()} />)
    const bar = screen.getByRole("progressbar", { name: "50% done" })
    expect(bar.getAttribute("data-running")).toBe("true")
    const fill = bar.firstElementChild as HTMLElement
    expect(fill.style.transform).toBe("scaleX(0.5)")
    expect(fill.style.width).toBe("")
    expect(screen.queryByRole("button", { name: "More for Acme" })).toBeNull()
  })

  it("counts in words a person uses, and in the right number", () => {
    const h = handlers()
    render(<ImportJobRow job={job("running", { errors_total: 1 })} {...h} />)
    fireEvent.click(screen.getByRole("button", { name: "1 error" }))
    expect(h.onShowErrors).toHaveBeenCalledOnce()
    expect(screen.getByText("2 of 4 parts")).toBeTruthy()
    expect(screen.queryByText(/chunks/)).toBeNull()
    expect(screen.getByText("120 items")).toBeTruthy()
  })
})

describe("which tool an import came from", () => {
  // Design v3 (§1.5): a tool is a category, so its mark is a neutral glyph or
  // initial in ink-2 on sunken. It was a camp-hued square per tool, which
  // spent six hues on eight tools.
  it("marks the tool with a neutral mark and names it where tools are mixed", () => {
    const { container } = render(<ImportJobRow job={job("completed", { provider: "jira" })} showProvider {...handlers()} />)
    const mark = container.querySelector("[data-source-mark]") as HTMLElement
    expect(mark.getAttribute("data-source-mark")).toBe("jira")
    expect(mark.textContent).toBe("J")
    expect(container.querySelector("[data-hue]")).toBeNull()
    expect(screen.getByText(/Jira ·/)).toBeTruthy()
  })
})

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OnboardingState, OnboardingStep } from "@/services/onboardingService"

const svc = vi.hoisted(() => ({
  getOnboardingStatus: vi.fn<() => Promise<OnboardingState | undefined>>(),
  dismissOnboarding: vi.fn<() => Promise<void>>(),
  setStepSkipped: vi.fn<(id: string, skipped: boolean) => Promise<void>>(),
}))
vi.mock("@/services/onboardingService", () => svc)

import SetupChecklist, { CHECKLIST_MEMO_KEY, UNDO_HIDE_MS } from "./SetupChecklist"

const step = (id: string, over: Partial<OnboardingStep> = {}): OnboardingStep => ({
  id,
  title: `Step ${id}`,
  detail: `What ${id} does`,
  href: `/app/${id}`,
  done: false,
  ...over,
})
const status = (steps: OnboardingStep[], over: Partial<OnboardingState> = {}): OnboardingState => {
  const open = steps.filter((s) => !s.done && !s.skipped).length
  const done = steps.filter((s) => s.done).length
  return { dismissed: false, steps, done, total: open + done, complete: open === 0, skipped: steps.filter((s) => s.skipped).length, ...over }
}

async function show(isAdmin: boolean | undefined = true) {
  await act(async () => {
    render(<SetupChecklist isAdmin={isAdmin} />)
  })
}
const card = () => screen.queryByRole("region", { name: "Finish setting up your workspace" })

beforeEach(() => {
  localStorage.clear()
  svc.getOnboardingStatus.mockReset()
  svc.dismissOnboarding.mockReset().mockResolvedValue()
  svc.setStepSkipped.mockReset().mockResolvedValue()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("hiding the setup checklist", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    svc.getOnboardingStatus.mockResolvedValue(status([step("admin", { done: true }), step("invite"), step("import", { skippable: true })]))
  })

  it("hides at once, offers Undo, and only then tells the server", async () => {
    await show()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hide the setup checklist" })))
    expect(card()).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("Setup checklist hidden.")
    await act(async () => vi.advanceTimersByTime(UNDO_HIDE_MS - 100))
    expect(svc.dismissOnboarding).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Undo" })))
    expect(card()).not.toBeNull()
    await act(async () => vi.advanceTimersByTime(UNDO_HIDE_MS * 3))
    expect(svc.dismissOnboarding).not.toHaveBeenCalled()
  })

  it("tells the server once the moment to undo has passed, and remembers it here", async () => {
    await show()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hide the setup checklist" })))
    await act(async () => vi.advanceTimersByTime(UNDO_HIDE_MS + 50))
    expect(svc.dismissOnboarding).toHaveBeenCalledOnce()
    expect(localStorage.getItem(CHECKLIST_MEMO_KEY)).toBe("closed")
    // The line stays where the card was, so Home does not jump as it goes.
    expect(screen.getByRole("status")).toHaveTextContent("Setup checklist hidden.")
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull()
  })

  it("still hides it when the admin leaves Home before the moment passes", async () => {
    await show()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Hide the setup checklist" })))
    cleanup()
    expect(svc.dismissOnboarding).toHaveBeenCalledOnce()
  })
})

describe("the checklist while it loads", () => {
  it("holds its place for an admin, so Home does not jump when it arrives", async () => {
    svc.getOnboardingStatus.mockReturnValue(new Promise(() => {}))
    await show()
    expect(screen.getByRole("status", { name: "Loading the setup checklist" })).toBeInTheDocument()
  })

  it("holds nothing in a browser where it was finished or hidden", async () => {
    localStorage.setItem(CHECKLIST_MEMO_KEY, "closed")
    svc.getOnboardingStatus.mockReturnValue(new Promise(() => {}))
    await show()
    expect(screen.queryByRole("status", { name: "Loading the setup checklist" })).toBeNull()
  })

  it("holds nothing for a member", async () => {
    svc.getOnboardingStatus.mockReturnValue(new Promise(() => {}))
    await show(false)
    expect(screen.queryByRole("status", { name: "Loading the setup checklist" })).toBeNull()
    expect(svc.getOnboardingStatus).not.toHaveBeenCalled()
  })

  it("remembers whether there was anything to show", async () => {
    svc.getOnboardingStatus.mockResolvedValue(status([step("invite")]))
    await show()
    expect(localStorage.getItem(CHECKLIST_MEMO_KEY)).toBe("open")
    cleanup()
    svc.getOnboardingStatus.mockResolvedValue(status([step("invite", { done: true })]))
    await show()
    expect(localStorage.getItem(CHECKLIST_MEMO_KEY)).toBe("closed")
  })
})

describe("the steps it lists", () => {
  it("shows three open steps in the server's order, and the rest on request", async () => {
    const steps = [step("admin", { done: true }), ...["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => step(id))]
    svc.getOnboardingStatus.mockResolvedValue(status(steps))
    await show()
    const links = () => within(card()!).getAllByRole("link").map((a) => a.getAttribute("href"))
    expect(links()).toEqual(["/app/a", "/app/b", "/app/c"])
    expect(within(card()!).getByText("1 of 9 done.", { exact: false })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Show 5 more" })))
    expect(links()).toEqual(["/app/a", "/app/b", "/app/c", "/app/d", "/app/e", "/app/f", "/app/g", "/app/h"])
  })

  it("marks the one to do now", async () => {
    svc.getOnboardingStatus.mockResolvedValue(status([step("invite"), step("import")]))
    await show()
    expect(within(screen.getByRole("link", { name: /Step invite/ })).getByText("Start")).toBeInTheDocument()
  })

  it("sets a step aside at once, before the server answers", async () => {
    svc.getOnboardingStatus.mockResolvedValue(status([step("invite"), step("import", { skippable: true })]))
    svc.setStepSkipped.mockReturnValue(new Promise(() => {}))
    await show()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nothing to import" })))
    expect(screen.queryByRole("link", { name: /Step import/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Show 1 set aside" })).toBeInTheDocument()
    expect(svc.setStepSkipped).toHaveBeenCalledWith("import", true)
  })

  it("puts the step back and says so when setting it aside fails", async () => {
    svc.getOnboardingStatus.mockResolvedValue(status([step("invite"), step("import", { skippable: true })]))
    svc.setStepSkipped.mockRejectedValue(new Error("Network Error"))
    await show()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nothing to import" })))
    expect(screen.getByRole("link", { name: /Step import/ })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't set that step aside. Try again.")
  })
})

describe("the checklist's heading", () => {
  it("sits beside a moss tile, as Home's other cards sit beside theirs", async () => {
    svc.getOnboardingStatus.mockResolvedValue(status([step("invite")]))
    await show()
    const heading = screen.getByRole("heading", { name: "Finish setting up your workspace" })
    const row = heading.parentElement!.parentElement!
    const tile = row.querySelector("span.hue-moss")
    expect(tile).not.toBeNull()
    expect(tile!.querySelector("svg")).not.toBeNull()
  })

  it("holds the tile's place while it loads", async () => {
    svc.getOnboardingStatus.mockReturnValue(new Promise(() => {}))
    await show()
    const placeholder = screen.getByRole("status", { name: "Loading the setup checklist" })
    expect(placeholder.querySelector(".size-8")).not.toBeNull()
  })
})

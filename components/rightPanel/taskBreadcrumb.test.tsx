import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// Step 3, part 3 (the rivals review against Linear and Jira, 16 Oct): a
// subtask's header named only its project; its parent was a line in the
// body. The header's path is the project, then the parent.

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy: vi.fn() }) }))
vi.mock("@/components/later/SaveForLater", () => ({ SaveForLaterButton: () => null }))
vi.mock("@/components/ui/graphics/ProjectTile", () => ({ ProjectTile: () => <span data-project-tile="" /> }))

import { RightPanelTaskHeader } from "./RightPanelTaskHeader"

afterEach(cleanup)

const base = { isAdmin: true, canMarkComplete: true, onMarkComplete: () => {}, taskUUID: "t1", taskName: "Write the FAQ", projectName: "Q4 launch", projectUUID: "p1" }

describe("the task header's path", () => {
  it("names the project, then the parent a subtask sits under, and opens the parent", () => {
    const open = vi.fn()
    render(<RightPanelTaskHeader {...base} parent={{ name: "Pricing page copy", onOpen: open }} />)
    const path = screen.getByRole("navigation", { name: "Where this task sits" })
    const crumbs = within(path).getAllByRole("listitem").map((li) => li.textContent)
    expect(crumbs).toEqual(["Q4 launch", "Pricing page copy"])
    expect(within(path).getByRole("link", { name: "Q4 launch" }).getAttribute("href")).toBe("/app/project/p1")
    fireEvent.click(within(path).getByRole("button", { name: "Open Pricing page copy, the task this one is part of" }))
    expect(open).toHaveBeenCalled()
  })

  // In the panel (452 px) the path has about 100 px beside Mark complete and
  // the panel's buttons, and on a phone about 180: the two names cut each
  // other short ("Pricin…"). Under 40rem of header, a subtask's project is its
  // tile, its name kept for screen readers, so the parent's name reads.
  it("gives the parent the room on a narrow header: there the project is its tile, still named", () => {
    render(<RightPanelTaskHeader {...base} parent={{ name: "Pricing page copy", onOpen: () => {} }} />)
    expect(document.querySelector("[data-task-header]")!.className).toContain("@container/taskhead")
    const name = screen.getByText("Q4 launch")
    expect(name.className).toContain("@max-[40rem]/taskhead:sr-only")
    // The project holds 96 px only where its name shows.
    expect(name.closest("li")!.className.split(" ")).not.toContain("min-w-[96px]")
    // A tile alone is 16 px: under a finger each crumb reaches 44 (phone.css F3).
    expect(screen.getByRole("link", { name: "Q4 launch" }).hasAttribute("data-touch-target")).toBe(true)
    expect(screen.getByRole("button", { name: /^Open Pricing page copy/ }).hasAttribute("data-touch-target")).toBe(true)
  })

  it("keeps the project's name where there is no parent to make room for", () => {
    render(<RightPanelTaskHeader {...base} />)
    const name = screen.getByText("Q4 launch")
    expect(name.className).not.toContain("sr-only")
    expect(name.closest("li")!.className.split(" ")).toContain("min-w-[96px]")
  })

  // A name the header cuts short (the 452 px panel, a phone) shows whole in
  // a tip under its crumb; one that fits shows none. jsdom lays nothing out,
  // so a test says how wide a name is.
  const widths = (el: Element, scroll: number, client: number) => {
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll })
    Object.defineProperty(el, "clientWidth", { configurable: true, value: client })
  }
  const parentCrumb = () => screen.getByRole("button", { name: /^Open Pricing page copy/ })

  it("shows a parent's name the header cuts short whole, in a tip under its crumb", async () => {
    render(<RightPanelTaskHeader {...base} parent={{ name: "Pricing page copy", onOpen: () => {} }} />)
    widths(parentCrumb(), 118, 61)
    fireEvent.focus(parentCrumb())
    const tip = await screen.findByRole("tooltip")
    expect(tip.textContent).toBe("Pricing page copy")
  })

  it("shows the project's name in a tip where its crumb is only the tile", async () => {
    render(<RightPanelTaskHeader {...base} parent={{ name: "Pricing page copy", onOpen: () => {} }} />)
    // Under 40rem its name is screen-reader only: a 1 px box.
    widths(screen.getByText("Q4 launch"), 64, 1)
    fireEvent.focus(screen.getByRole("link", { name: "Q4 launch" }))
    expect((await screen.findByRole("tooltip")).textContent).toBe("Q4 launch")
  })

  it("shows no tip for a name that fits", async () => {
    render(<RightPanelTaskHeader {...base} parent={{ name: "QA", onOpen: () => {} }} />)
    const crumb = screen.getByRole("button", { name: /^Open QA/ })
    widths(crumb, 18, 18)
    fireEvent.focus(crumb)
    await act(async () => {})
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("closes its tip on Escape", async () => {
    render(<RightPanelTaskHeader {...base} parent={{ name: "Pricing page copy", onOpen: () => {} }} />)
    widths(parentCrumb(), 118, 61)
    fireEvent.focus(parentCrumb())
    await screen.findByRole("tooltip")
    fireEvent.keyDown(parentCrumb(), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
  })

  it("is the project alone for a task with no parent", () => {
    render(<RightPanelTaskHeader {...base} />)
    const path = screen.getByRole("navigation", { name: "Where this task sits" })
    expect(within(path).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Q4 launch"])
  })
})

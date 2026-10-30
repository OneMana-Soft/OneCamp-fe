import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// STEP4 #8 (projects A8K): the task's key is the header path's last crumb, a
// button that copies it; the panel's previous and next walk the list it was
// opened from, and at an end say why they do nothing.

const copy = vi.fn()
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copy }) }))
vi.mock("@/components/later/SaveForLater", () => ({
  SaveForLaterButton: ({ className }: { className?: string }) => <button type="button" aria-label="Save for later" className={className} />,
}))
vi.mock("@/components/ui/graphics/ProjectTile", () => ({ ProjectTile: () => <span data-project-tile="" /> }))

import { RightPanelTaskHeader } from "./RightPanelTaskHeader"
import { pageGroups } from "@/lib/shortcuts/pageGroups"

afterEach(() => {
  cleanup()
  copy.mockReset()
})

const base = { isAdmin: true, canMarkComplete: true, onMarkComplete: () => {}, taskUUID: "t1", taskName: "Write the FAQ", projectName: "Q4 launch", projectUUID: "p1" }
const path = () => screen.getByRole("navigation", { name: "Where this task sits" })

describe("the task's key in its header", () => {
  it("comes last, after a sub-task's parent, and copies itself", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" parent={{ name: "Pricing page copy", onOpen: () => {} }} />)
    expect(within(path()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Q4 launch", "Pricing page copy", "Q4-12"])
    fireEvent.click(within(path()).getByRole("button", { name: "Copy key Q4-12" }))
    expect(copy).toHaveBeenCalledWith("Q4-12", "Copied Q4-12")
  })

  it("follows the project on a task of its own, and the project gives it the room on a narrow header", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" />)
    expect(within(path()).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Q4 launch", "Q4-12"])
    expect(screen.getByText("Q4 launch").className).toContain("@max-[40rem]/taskhead:sr-only")
    // The key never truncates, and reaches 44 px under a finger.
    const key = screen.getByRole("button", { name: "Copy key Q4-12" })
    expect(key.className).toContain("whitespace-nowrap")
    expect(key.className).not.toContain("truncate")
    expect(key.hasAttribute("data-touch-target")).toBe(true)
  })

  // As Linear's ⌘. copies an issue's ID: from anywhere on the open task, and
  // the keys list says so while it's open.
  it("copies itself on Ctrl/⌘ + ., listed in the keys list while the task is open", () => {
    const listed = () => pageGroups().some((g) => g.rows.some((r) => r.does === "Copy the task's key" && r.keys === "Ctrl/⌘ + ."))
    const { unmount } = render(<RightPanelTaskHeader {...base} taskKey="Q4-12" />)
    fireEvent.keyDown(window, { key: ".", ctrlKey: true })
    expect(copy).toHaveBeenCalledWith("Q4-12", "Copied Q4-12")
    expect(listed()).toBe(true)
    unmount()
    expect(listed()).toBe(false)
    copy.mockReset()
    render(<RightPanelTaskHeader {...base} />)
    fireEvent.keyDown(window, { key: ".", ctrlKey: true })
    expect(copy).not.toHaveBeenCalled()
  })

  it("is what the task's link carries", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" />)
    fireEvent.click(screen.getByRole("button", { name: "Copy task link" }))
    expect(copy.mock.calls[0][0]).toMatch(/\/app\/task\/Q4-12$/)
    expect(screen.getByRole("link", { name: "Open the full page" }).getAttribute("href")).toBe("/app/task/Q4-12")
  })

  // The 452 px panel's header, 17 Oct shots: a nowrap name asked for its whole
  // width as the path's least, so the path shrank past the key and the key
  // slid under Mark complete. Names are clamped instead, and Mark complete is
  // what gives way.
  it("gives a crumb's name way to the key, never the key", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" parent={{ name: "Pricing page copy", onOpen: () => {} }} />)
    expect(path().className.split(" ")).toContain("min-w-min")
    for (const name of [screen.getByText("Q4 launch"), screen.getByText("Pricing page copy")]) {
      const classes = name.className.split(" ")
      expect(classes).toEqual(expect.arrayContaining(["line-clamp-1", "break-all"]))
      expect(classes).not.toContain("truncate")
    }
  })

  // DESIGN-BUILD-10, 24 Oct: in a sub-task's 452 px panel Mark complete went
  // to its glyph while the parent kept "Write the la…". The parent gives way
  // first now, as the project does: a glyph, its name in the tip and still read.
  it("gives a sub-task's parent way first where the header is narrow, its name to its tip", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-104" parent={{ name: "Write the launch post", onOpen: () => {} }} />)
    const parent = screen.getByRole("button", { name: "Open Write the launch post, the task this one is part of" })
    expect(parent.querySelector("svg")?.getAttribute("class")).toContain("@max-[40rem]/taskhead:block")
    expect(within(parent).getByText("Write the launch post").className).toContain("@max-[40rem]/taskhead:sr-only")
  })

  // d5h1, 24 Oct: with the parent a glyph, a sub-task's room in the 452 px
  // panel was still 97 px, short of Mark complete's 136. The glyph leads into
  // the key with no chevron between them there, and Save for later is the
  // icons' 28 px with a mouse, not 32 (44 under a finger); a task of its own
  // keeps its chevron.
  it("drops the chevron between a sub-task's parent glyph and its key where the header is narrow", () => {
    const chevron = () => screen.getByRole("button", { name: /^Copy key / }).closest("li")!.querySelector("svg")!.getAttribute("class")
    render(<RightPanelTaskHeader {...base} taskKey="Q4-104" parent={{ name: "Write the launch post", onOpen: () => {} }} />)
    expect(chevron()).toContain("@max-[40rem]/taskhead:hidden")
    expect(screen.getByRole("button", { name: "Save for later" }).className).toBe("size-7 pointer-coarse:size-11")
    cleanup()
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" />)
    expect(chevron()).not.toContain("@max-[40rem]/taskhead:hidden")
  })

  it("ends Ask for approval, Link to GitHub and Create branch in an ellipsis, as each asks for more before it acts", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" onDeleteTask={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More task actions" }), { key: "Enter" })
    expect(screen.getByRole("menuitem", { name: "Ask for approval…" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Link to GitHub…" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Create branch…" })).toBeTruthy()
  })

  it("names a parent the reader can't see the same way, without opening it", () => {
    render(<RightPanelTaskHeader {...base} parent={{ name: "A task you can't see" }} />)
    const name = screen.getByText("A task you can't see")
    expect(name.className).toContain("@max-[40rem]/taskhead:sr-only")
    expect(name.closest("[data-hidden-task]")?.querySelector("svg")).toBeTruthy()
    expect(name.closest("button")).toBeNull()
  })

  // DESIGN-BUILD-10, 24 Oct: a viewer's "Completed" was a disabled button,
  // faded to 3.45:1. It is the task's state, so it reads as one.
  it("shows someone who can't edit a done task's state, at full strength and not as a button", () => {
    render(<RightPanelTaskHeader {...base} isAdmin={false} canMarkComplete={false} />)
    expect(screen.queryByRole("button", { name: "Task completed" })).toBeNull()
    const state = screen.getByText("Completed")
    expect(state.closest("button")).toBeNull()
    expect(state.closest("[data-done]")?.className).toContain("text-foreground")
    expect(state.closest("[data-done]")?.querySelector("svg")).toBeTruthy()
  })

  it("shows someone who can't edit an open task nothing to complete", () => {
    render(<RightPanelTaskHeader {...base} isAdmin={false} />)
    expect(screen.queryByRole("button", { name: "Mark task as complete" })).toBeNull()
    expect(screen.queryByText("Completed")).toBeNull()
  })

  it("says Complete where Mark complete's words don't fit beside the path, and is its glyph alone below that", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" />)
    const complete = screen.getByRole("button", { name: "Mark task as complete" })
    const room = complete.closest("[data-complete-room]") as HTMLElement
    expect(room.className.split(" ")).toEqual(expect.arrayContaining(["@container/complete", "flex-1", "min-w-7"]))
    expect(screen.getByText("Mark complete").className).toContain("@max-[8.5rem]/complete:sr-only")
    const short = screen.getByText("Complete")
    expect(short.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "@[6.75rem]/complete:@max-[8.5rem]/complete:inline"]))
    expect(short.getAttribute("aria-hidden")).toBe("true")
    expect(complete.className).toContain("@max-[6.75rem]/complete:w-7")
  })

  // DESIGN-BUILD-2, 17 Oct: a bare check in a 28 px box read as a ticked
  // checkbox, the task as done. Open, the check sits in a hollow ring, which
  // fills with moss once done; the same glyph with words or without.
  it("draws an open task's check inside a hollow ring", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" />)
    const glyph = screen.getByRole("button", { name: "Mark task as complete" }).querySelector("svg")!
    expect(glyph.getAttribute("data-glyph")).toBe("open")
    expect(glyph.querySelector("circle")!.getAttribute("fill")).toBe("none")
    expect(glyph.querySelector("path")!.getAttribute("d")).toBe("m5.2 8.2 1.9 1.9 3.8-4")
  })

  // Gone to its glyph, Mark complete keeps its words for a mouse in a tip,
  // which opens only while the words are screen-reader only (jsdom lays
  // nothing out, so a test says how wide the words are).
  const words = (el: Element, scroll: number, client: number) => {
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll })
    Object.defineProperty(el, "clientWidth", { configurable: true, value: client })
  }
  it("says Mark complete in a tip where it's only its glyph, and only there", async () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" />)
    const complete = screen.getByRole("button", { name: "Mark task as complete" })
    words(screen.getByText("Mark complete"), 88, 1)
    fireEvent.focus(complete)
    expect((await screen.findByRole("tooltip")).textContent).toBe("Mark complete")
  })

  it("shows no tip while Mark complete's words show", async () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" />)
    const complete = screen.getByRole("button", { name: "Mark task as complete" })
    words(screen.getByText("Mark complete"), 88, 88)
    fireEvent.focus(complete)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole("tooltip")).toBeNull()
  })

  it("offers a done task's Mark as not done on hover only where it fits", () => {
    render(<RightPanelTaskHeader {...base} canMarkComplete={false} onReopen={() => {}} taskKey="Q4-12" />)
    expect(screen.getByText("Completed").className).toContain("@[9.75rem]/complete:group-hover/done:hidden")
    expect(screen.getByText("Mark as not done").className.split(" ")).toEqual(expect.arrayContaining(["hidden", "@[9.75rem]/complete:group-hover/done:inline"]))
  })

  it("folds the link into More on a narrow header, where More always offers it", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" onDeleteTask={() => {}} />)
    expect(screen.getByRole("button", { name: "Copy task link" }).className).toContain("@max-[30rem]/taskhead:hidden")
    fireEvent.keyDown(screen.getByRole("button", { name: "More task actions" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }))
    expect(copy.mock.calls[0][0]).toMatch(/\/app\/task\/Q4-12$/)
  })

  // 24 Oct, D4: the Connected icon took the 452 px header's last 30 px, and
  // Mark complete went to its glyph. The full page folds as the link does.
  it("folds the full page into More on a narrow header too, where More always offers it", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" onDeleteTask={() => {}} />)
    expect(screen.getByRole("link", { name: "Open the full page" }).className).toContain("@max-[30rem]/taskhead:hidden")
    const more = screen.getByRole("button", { name: "More task actions" })
    expect(more.className).not.toContain("@[30rem]/taskhead:hidden")
    fireEvent.keyDown(more, { key: "Enter" })
    expect(screen.getByRole("menuitem", { name: "Open the full page" }).getAttribute("href")).toBe("/app/task/Q4-12")
  })

  // CR-20: someone who can't edit had no More, so their seven icons left
  // "Completed" no more room than the editor's had.
  it("folds them for someone who can't edit too, whose More shows only where they fold", () => {
    render(<RightPanelTaskHeader {...base} isAdmin={false} taskKey="Q4-12" onDeleteTask={() => {}} />)
    expect(screen.getByRole("button", { name: "Copy task link" }).className).toContain("@max-[30rem]/taskhead:hidden")
    expect(screen.getByRole("link", { name: "Open the full page" }).className).toContain("@max-[30rem]/taskhead:hidden")
    const more = screen.getByRole("button", { name: "More task actions" })
    expect(more.className).toContain("@[30rem]/taskhead:hidden")
    fireEvent.keyDown(more, { key: "Enter" })
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Copy link", "Open the full page"])
    expect(screen.queryByRole("separator")).toBeNull()
  })

  it("keeps the link's and the full page's icons for a task in the trash, which has no More", () => {
    render(<RightPanelTaskHeader {...base} taskKey="Q4-12" deleted onDeleteTask={() => {}} />)
    expect(screen.queryByRole("button", { name: "More task actions" })).toBeNull()
    expect(screen.getByRole("button", { name: "Copy task link" }).className).not.toContain("@max-[30rem]/taskhead:hidden")
    expect(screen.getByRole("link", { name: "Open the full page" }).className).not.toContain("@max-[30rem]/taskhead:hidden")
  })

  it("leaves the path and the link as they were for a task with no key yet", () => {
    render(<RightPanelTaskHeader {...base} />)
    expect(within(path()).getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByRole("link", { name: "Open the full page" }).getAttribute("href")).toBe("/app/task/t1")
  })
})

describe("previous and next in the panel", () => {
  it("move along the list it was opened from, and at its start say why one does nothing", () => {
    const open = vi.fn()
    render(<RightPanelTaskHeader {...base} place={{ index: 1, total: 3, next: "t2" }} onOpenTask={open} />)
    const first = screen.getByRole("button", { name: "This is the first task" })
    expect(first.getAttribute("aria-disabled")).toBe("true")
    fireEvent.click(first)
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Next task (J)" }))
    expect(open).toHaveBeenCalledWith("t2")
    // "1 / 3" shows only once the header is 40rem wide.
    const counter = screen.getByText("1 / 3")
    expect(counter.className).toContain("hidden")
    expect(counter.className).toContain("@[40rem]/taskhead:inline")
  })

  it("aren't there for a task opened from no list", () => {
    render(<RightPanelTaskHeader {...base} place={{ index: 0, total: 0 }} onOpenTask={() => {}} />)
    expect(screen.queryByRole("button", { name: /task \((J|K)\)/ })).toBeNull()
    expect(document.querySelector("[data-task-sequence-nav]")).toBeNull()
  })
})

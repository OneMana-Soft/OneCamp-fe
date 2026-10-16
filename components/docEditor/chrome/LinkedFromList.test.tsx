import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/components/navigationBar/desktop/IntentLink", () => ({
  IntentLink: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import type { ReactNode } from "react"
import LinkedFromList, { backlinkCount, linksOf } from "./LinkedFromList"
import { useBacklinksShown } from "./backlinksPref"
import { renderHook } from "@testing-library/react"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const links = {
  docs: [{ doc_uuid: "d1", doc_title: "Launch notes", doc_icon: "📘" }, { doc_uuid: "d2", doc_title: "" }],
  tasks: [{ task_uuid: "t1", task_name: "Write the brief" }],
  projects: [{ project_uuid: "p1", project_name: "Apollo" }],
}

describe("Linked from (P1.3)", () => {
  it("puts what links here in one list, docs first, as 4 backlinks", () => {
    expect(linksOf(links).map((l) => l.href)).toEqual(["/app/doc/d1", "/app/doc/d2", "/app/task/t1", "/app/project/p1"])
    expect(backlinkCount(1)).toBe("1 backlink")
    expect(backlinkCount(4)).toBe("4 backlinks")
    render(<LinkedFromList links={links} refType="doc" refUUID="x" />)
    expect(screen.getByRole("region", { name: "4 backlinks" })).toBeTruthy()
    // The first three at once, the rest a press away.
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["📘Launch notes", "Untitled", "Write the brief"])
    act(() => fireEvent.click(screen.getByRole("button", { name: "1 more" })))
    expect(screen.getAllByRole("link")).toHaveLength(4)
    expect(screen.getByRole("button", { name: "Fewer" }).getAttribute("aria-expanded")).toBe("true")
  })

  it("is hidden on a doc for whoever hid it, and on a board never", () => {
    const { result } = renderHook(() => useBacklinksShown("x"))
    act(() => result.current[1](false))
    const view = render(<LinkedFromList links={links} refType="doc" refUUID="x" />)
    expect(view.container.textContent).toBe("")
    view.unmount()
    render(<LinkedFromList links={links} refType="board" refUUID="x" />)
    expect(screen.getByText("4 backlinks")).toBeTruthy()
  })
})

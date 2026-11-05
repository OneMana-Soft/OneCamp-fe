import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { PeopleLine } from "./peopleLine"

afterEach(cleanup)

// Who is in something, as one line (a huddle's card first, slack-06), in
// nameList's words: names, then a count. A name may be cut where the line is
// short; the count never is, and a narrow line writes it "+2" (DESIGN-BUILD-113,
// 5 Nov: "Jonas, Maya and 1 o…" beside Join at 390).
describe("the people line", () => {
  it("keeps the count whole, writes it +N in a narrow line, and is heard in full", () => {
    const { container } = render(<PeopleLine names={["Jonas", "Maya"]} count={3} className="text-meta" />)
    const line = container.querySelector("[data-people-line]") as HTMLElement
    expect(line.className).toContain("@container")
    expect(line.className).toContain("text-meta")
    // Heard once, in words; the drawn line is hidden from a screen reader.
    expect(line.querySelector(".sr-only")?.textContent).toBe("Jonas, Maya and 1 other")
    const drawn = line.querySelector("[aria-hidden]") as HTMLElement
    const [names, full, narrow] = Array.from(drawn.children) as HTMLElement[]
    expect(names.textContent).toBe("Jonas, Maya")
    expect(names.className).toContain("truncate")
    // Only the names give way: both counts keep their width and their space.
    for (const count of [full, narrow]) expect(count.className.split(" ")).toEqual(expect.arrayContaining(["shrink-0", "whitespace-pre"]))
    expect(full.textContent).toBe(" and 1 other")
    expect(full.className).toContain("@max-[10rem]:hidden")
    expect(narrow.textContent).toBe(" +1")
    expect(narrow.className.split(" ")).toContain("hidden")
    expect(narrow.className).toContain("@max-[10rem]:inline")
  })

  it("draws one plain line when there is no count, and nothing for nobody", () => {
    const { container, rerender } = render(<PeopleLine names={["Maya", "Jonas"]} count={2} />)
    const line = container.querySelector("[data-people-line]") as HTMLElement
    expect(line.textContent).toBe("Maya and Jonas")
    expect(line.querySelector("[aria-hidden]")).toBeNull()
    rerender(<PeopleLine names={["Maya", "Jonas", "Sam"]} count={3} />)
    expect(container.querySelector("[data-people-line]")?.textContent).toBe("Maya, Jonas and Sam")
    rerender(<PeopleLine names={[]} count={2} />)
    expect(container.querySelector("[data-people-line]")?.textContent).toBe("2 people")
    rerender(<PeopleLine names={[]} count={0} />)
    expect(container.querySelector("[data-people-line]")).toBeNull()
  })
})

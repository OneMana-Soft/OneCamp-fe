import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import MarkdownMessage, { cellLines, splitTableRow } from "@/components/ai/MarkdownMessage"

afterEach(cleanup)

const cellsOf = (row: Element) => [...row.querySelectorAll("th, td")].map((c) => c.textContent)

describe("a table in an answer", () => {
    // The demo's AI answered "What did the team discuss today?" with a table
    // and showed it as raw pipes and dashes.
    it("renders as a table, not pipes", () => {
        const { container } = render(
            <MarkdownMessage
                content={"Today's key points\n\n| Channel | Topics |\n|---|---|\n| #engineering | **Rollback** steps |\n| #design | Hero image |"}
            />,
        )
        const table = container.querySelector("table")
        expect(table).not.toBeNull()
        const rows = [...table!.querySelectorAll("tr")]
        expect(rows.map(cellsOf)).toEqual([
            ["Channel", "Topics"],
            ["#engineering", "Rollback steps"],
            ["#design", "Hero image"],
        ])
        expect(table!.querySelector("td strong")?.textContent).toBe("Rollback")
        expect(container.textContent).not.toContain("|---")
    })

    it("honours column alignment", () => {
        const { container } = render(<MarkdownMessage content={"| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |"} />)
        const aligns = [...container.querySelectorAll("td")].map((td) => (td as HTMLElement).style.textAlign)
        expect(aligns).toEqual(["left", "center", "right"])
    })

    it("keeps a pipe that is escaped or inside code in its cell", () => {
        expect(splitTableRow("| a \\| b | `x | y` |")).toEqual(["a | b", "`x | y`"])
    })

    it("fills a short row and drops what a long row adds", () => {
        const { container } = render(<MarkdownMessage content={"| a | b |\n|---|---|\n| only |\n| 1 | 2 | 3 |"} />)
        const body = [...container.querySelectorAll("tbody tr")].map(cellsOf)
        expect(body).toEqual([["only", ""], ["1", "2"]])
    })

    it("stays text while the delimiter row has not arrived", () => {
        const { container } = render(<MarkdownMessage content={"| Channel | Topics |"} />)
        expect(container.querySelector("table")).toBeNull()
        expect(container.textContent).toContain("| Channel | Topics |")
    })

    it("ends at a blank line, and the prose after it is a paragraph", () => {
        const { container } = render(<MarkdownMessage content={"| a |\n|---|\n| 1 |\n\nThat is all."} />)
        expect(container.querySelectorAll("tbody tr")).toHaveLength(1)
        expect(container.querySelector("p")?.textContent).toBe("That is all.")
    })

    it("does not mistake a lone rule or a dash list for a table", () => {
        const { container } = render(<MarkdownMessage content={"Before\n\n---\n\n- one - two\n- three"} />)
        expect(container.querySelector("table")).toBeNull()
        expect(container.querySelector("hr")).not.toBeNull()
        expect(container.querySelectorAll("li")).toHaveLength(2)
    })

    it("gives each point in a cell its own line", () => {
        expect(cellLines("Sam noted the date.\u2022 Jonas asked for rollback steps.")).toEqual([
            "Sam noted the date.",
            "\u2022 Jonas asked for rollback steps.",
        ])
        expect(cellLines("\u2022 one<br>\u2022 two<br/>three")).toEqual(["\u2022 one", "\u2022 two", "three"])
        expect(cellLines("plain")).toEqual(["plain"])
        const { container } = render(<MarkdownMessage content={"| a |\n|---|\n| one<br>two |"} />)
        expect(container.querySelectorAll("td br")).toHaveLength(1)
        expect(container.textContent).not.toContain("<br>")
    })

    it("keeps a word whole in a narrow column", () => {
        const { container } = render(<MarkdownMessage content={"| Channel | Points |\n|---|---|\n| #engineering | x |"} />)
        expect(container.querySelector("table")?.className).toContain("[overflow-wrap:break-word]")
    })
})

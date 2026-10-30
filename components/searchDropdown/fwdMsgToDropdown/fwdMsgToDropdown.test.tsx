import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// DG4's cap on the picker: it counts the places chosen to the server's limit
// (lib/chat forwardLimit), and at the limit stops taking more and says why.

const people = ["ana", "ben", "cy"].map((n) => ({ user_uuid: `u-${n}`, user_name: n }))
vi.mock("@/hooks/usePost", () => ({
    usePost: () => ({
        makeRequest: async ({ payload }: { payload: { search_text: string } }) =>
            people.filter((p) => p.user_name.startsWith(payload.search_text)),
    }),
}))
vi.mock("@/components/searchDropdown/fwdMsgToDropdown/fwdMsgToProfileAvatar", () => ({ FwdMsgToProfileAvatar: () => null }))

const { ForwardMessageDropdown } = await import("@/components/searchDropdown/fwdMsgToDropdown/fwdMsgToDropdown")

afterEach(cleanup)

async function choose(name: string) {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: name } })
    fireEvent.click(await screen.findByText(name, { selector: "span" }, { timeout: 2000 }))
}

describe("the forward picker's count", () => {
    it("counts the places chosen to 100, and says nothing before one is", async () => {
        const onSelect = vi.fn()
        render(<ForwardMessageDropdown onSelect={onSelect} />)
        expect(screen.getByRole("status").textContent).toBe("")
        await choose("ana")
        expect(screen.getByRole("status").textContent).toBe("1 of 100 places")
        expect(onSelect).toHaveBeenLastCalledWith([expect.objectContaining({ user_uuid: "u-ana" })])
    })

    it("stops at the limit and says why, and takes more again once one is removed", async () => {
        const onSelect = vi.fn()
        render(<ForwardMessageDropdown onSelect={onSelect} maxItems={2} />)
        await choose("ana")
        await choose("ben")
        expect(screen.getByRole("status").textContent).toContain("that's the most one forward can go to")
        expect(screen.getByRole("textbox")).toHaveProperty("disabled", true)
        expect(onSelect).toHaveBeenLastCalledWith([expect.objectContaining({ user_uuid: "u-ana" }), expect.objectContaining({ user_uuid: "u-ben" })])

        fireEvent.click(screen.getByRole("button", { name: "Remove ben" }))
        expect(screen.getByRole("status").textContent).toBe("1 of 2 places")
        expect(screen.getByRole("textbox")).toHaveProperty("disabled", false)
    })
})

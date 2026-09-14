import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

let admin = true
let caps: string[] = []
const pushed: string[] = []

vi.mock("@/hooks/useCapabilities", () => ({
    useCapabilities: () => ({ can: (c: string) => caps.includes(c) }),
}))
vi.mock("@/hooks/useFetch", () => ({
    useFetchOnlyOnce: () => ({ data: { data: { user_is_admin: admin } } }),
}))
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => ({ logout: () => {} }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (p: string) => pushed.push(p) }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: () => {} }) }))
vi.mock("@/components/invite/MemberInviteDialog", () => ({ MemberInviteDialog: () => null }))

import { UserProfileDrawer } from "@/components/drawers/userProfileDrawer"

beforeEach(() => {
    admin = true
    caps = []
    pushed.length = 0
})
afterEach(cleanup)

const open = () => render(<UserProfileDrawer drawerOpenState={true} setOpenState={() => {}} />)

describe("the mobile More drawer", () => {
    // Five cells of bottom bar plus this drawer is the whole of mobile
    // navigation, so anything missing here is missing from the phone.
    it("carries Tables, which had no door on a phone at all", () => {
        open()
        expect(screen.getByText("Tables")).toBeTruthy()
    })

    it("does not spend a row on Channels, which is in the bottom bar", () => {
        open()
        expect(screen.queryByText("Channels")).toBeNull()
    })

    it("gets an admin to Admin without going via the org avatar", () => {
        open()
        expect(screen.getByText("Admin")).toBeTruthy()
    })

    it("shows no Admin row to everyone else", () => {
        admin = false
        open()
        expect(screen.queryByText("Admin")).toBeNull()
    })

    it("groups the rows rather than stacking a dozen unrelated ones", () => {
        open()
        for (const section of ["Work", "Workspace"]) {
            expect(screen.getByText(section), `no ${section} heading`).toBeTruthy()
        }
    })

    // The dark-mode row was a button with the Switch, itself a button, inside
    // it: invalid markup, two overlapping hit targets on a phone, and an
    // accessible name assistive tech reads twice.
    // This branch is the AI-free edition. A row here naming AI would be a door
    // to routes the build does not contain.
    it("names no AI anywhere", () => {
        open()
        expect(document.body.textContent).not.toMatch(/\bAI\b/)
    })

    it("nests no control inside another", () => {
        open()
        expect(document.querySelectorAll("button button").length).toBe(0)
    })

    it("still toggles the theme, named by the label people can see", () => {
        open()
        const toggle = screen.getByRole("switch")
        expect(toggle.getAttribute("aria-labelledby")).toBeTruthy()
        expect(document.getElementById(toggle.getAttribute("aria-labelledby")!)?.textContent).toBe("Dark mode")
    })
})

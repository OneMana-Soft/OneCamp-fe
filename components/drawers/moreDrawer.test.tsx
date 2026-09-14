import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

let aiOn = true
let admin = true
let caps: string[] = []
const pushed: string[] = []

vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
    useAIAvailable: () => aiOn,
    useFeature: () => aiOn,
}))
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
    aiOn = true
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

    it("reaches what the AI did in your name", () => {
        open()
        expect(screen.getByText("AI activity")).toBeTruthy()
    })

    // The AI-free edition has no AI routes, so a door to them is a door to a
    // failure the user only discovers after tapping.
    it("offers no AI anywhere when the server has none", () => {
        aiOn = false
        open()
        expect(screen.queryByText("AI activity")).toBeNull()
        expect(screen.queryByText("Agents & skills")).toBeNull()
        expect(screen.getByText("Tables")).toBeTruthy()
    })

    it("keeps the agent builder behind its capability as well as AI", () => {
        open()
        expect(screen.queryByText("Agents & skills")).toBeNull()
    })

    it("groups the rows rather than stacking a dozen unrelated ones", () => {
        open()
        for (const section of ["Work", "AI", "Workspace"]) {
            expect(screen.getByText(section), `no ${section} heading`).toBeTruthy()
        }
    })

    // The dark-mode row was a button with the Switch, itself a button, inside
    // it: invalid markup, two overlapping hit targets on a phone, and an
    // accessible name assistive tech reads twice.
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

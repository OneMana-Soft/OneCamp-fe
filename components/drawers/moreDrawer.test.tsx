import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

let admin = true
let caps: string[] = []
const pushed: string[] = []

vi.mock("@/hooks/useCapabilities", () => ({
    useCapabilities: () => ({ can: (c: string) => caps.includes(c) }),
}))
vi.mock("@/hooks/useFetch", () => ({
    useFetchOnlyOnce: () => ({ data: { data: { user_is_admin: admin, user_uuid: "u1", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/useLogout", () => ({ useLogout: () => ({ logout: () => {} }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (p: string) => pushed.push(p) }) }))
vi.mock("@/components/activeTheme/activeTheme", () => ({ useThemeConfig: () => ({ activeTheme: "onecamp", setActiveTheme: () => {} }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light", setTheme: (t: string) => themeSet.push(t) }) }))
vi.mock("@/components/invite/MemberInviteDialog", () => ({ MemberInviteDialog: () => null }))
let focusUntil: Date | null = null
let pausedUntil: Date | null = null
let themeSet: string[] = []
const started: number[] = []
vi.mock("@/hooks/usePauseNotifications", () => ({ usePauseNotifications: () => ({ pausedUntil, focusUntil }) }))
const dispatched: unknown[] = []
vi.mock("react-redux", () => ({ useSelector: () => undefined, useDispatch: () => (a: unknown) => dispatched.push(a) }))
vi.mock("@/hooks/useStartFocus", () => ({ useStartFocus: () => ({ startFocus: async () => (started.push(1), true), starting: false }) }))
vi.mock("@/hooks/reactions/useEmojiMartData", () => ({ useEmojiMartData: () => ({ data: undefined }) }))
vi.mock("@/components/navigationBar/mobile/phoneSelfAvatar", () => ({
    PhoneSelfAvatar: ({ focus, paused }: { focus?: boolean; paused?: boolean }) => <span data-avatar="" data-focus={focus || undefined} data-paused={paused || undefined} />,
}))
let pauseSheet: { open: boolean; onOpenChange: (o: boolean) => void } | null = null
vi.mock("@/components/notifications/PauseNotificationsDialog", () => ({
    PauseNotificationsDialog: (p: { open: boolean; onOpenChange: (o: boolean) => void }) => {
        pauseSheet = p
        return p.open ? <div data-testid="pause-sheet" /> : null
    },
    pauseMenuLabel: () => "Pause notifications…",
}))

import { UserProfileDrawer } from "@/components/drawers/userProfileDrawer"

beforeEach(() => {
    admin = true
    caps = []
    pushed.length = 0
    focusUntil = null
    pausedUntil = null
    themeSet = []
    started.length = 0
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

    // Design v3 (Ph3, M2): one row with a three-way choice. A "Dark mode"
    // switch could not say "match my device", which is the default.
    it("sets the theme with a three-way choice named Theme", () => {
        open()
        const group = screen.getByRole("radiogroup", { name: "Theme" })
        expect(document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent).toBe("Theme")
        const radios = within(group).getAllByRole("radio")
        expect(radios.map((r) => r.getAttribute("title"))).toEqual(["Light", "Dark", "Match my device"])
        fireEvent.click(radios[1])
        expect(themeSet).toEqual(["dark"])
    })

    // The account menu's theme colours (hub P2), each a 44px target here.
    it("offers the six theme colours at a finger's size, spread to the row's edges", () => {
        open()
        const colours = screen.getByRole("radiogroup", { name: "Theme colour" })
        const swatches = [...colours.querySelectorAll("[data-theme-swatch]")]
        expect(swatches).toHaveLength(6)
        // A 24px circle touched as 44 (2.5 × 4 = 10px past each side).
        for (const s of swatches) expect(s.className).toMatch(/\bsize-6\b[\s\S]*after:-inset-2\.5/)
    })
})

describe("the More sheet's You section", () => {
    it("comes first, with you, your state and the things you set about yourself", () => {
        open()
        const headings = ["You", "Work", "Workspace"].map((t) => screen.getByText(t))
        expect(headings[0].compareDocumentPosition(headings[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        const you = screen.getByRole("button", { name: /^Your profile: Sam Rivera, Active/ })
        fireEvent.click(you)
        expect(pushed).toEqual(["/app/profile"])
        expect(screen.getByRole("button", { name: /^Start focus time/ })).toBeTruthy()
        expect(screen.getByRole("button", { name: /^Pause notifications/ })).toBeTruthy()
    })

    it("starts an hour of focus from the row", async () => {
        open()
        fireEvent.click(screen.getByRole("button", { name: /^Start focus time/ }))
        await Promise.resolve()
        expect(started).toEqual([1])
    })

    it("says you are in focus, and rings your avatar, while you are", () => {
        focusUntil = new Date(Date.now() + 30 * 60_000)
        open()
        expect(document.querySelector("[data-you-status]")?.textContent).toMatch(/^In focus until /)
        expect(document.querySelector("[data-avatar]")?.hasAttribute("data-focus")).toBe(true)
        expect(screen.queryByRole("button", { name: /^Start focus time/ })).toBeNull()
    })

    it("says notifications are paused, and badges your avatar", () => {
        pausedUntil = new Date(Date.now() + 60 * 60_000)
        open()
        expect(document.querySelector("[data-you-status]")?.textContent).toMatch(/^Notifications paused until /)
        expect(document.querySelector("[data-avatar]")?.hasAttribute("data-paused")).toBe(true)
    })

    it("ends with Sign out in danger ink, on no red fill", () => {
        open()
        const out = screen.getByRole("button", { name: "Sign out" })
        expect(out.className).toMatch(/text-danger-ink/)
        expect(out.className).not.toMatch(/bg-destructive/)
    })

    // A phone had no way to set a status short of Settings > Profile; the
    // desktop's profile menu has it first.
    it("sets your status from the sheet, as the profile menu does", () => {
        const setOpen = vi.fn()
        dispatched.length = 0
        render(<UserProfileDrawer drawerOpenState={true} setOpenState={setOpen} />)
        fireEvent.click(screen.getByRole("button", { name: "Set a status" }))
        expect(dispatched).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ key: "userStatusUpdate" }) }))
        expect(setOpen).toHaveBeenCalledWith(false)
    })

    // The sheet unmounts when it closes, and the pause sheet lived inside it:
    // the row opened it and closed the sheet in one go, so on a phone
    // "Pause notifications…" did nothing at all.
    it("hands over to the pause sheet, and closes only once that is done", async () => {
        const setOpen = vi.fn()
        render(<UserProfileDrawer drawerOpenState={true} setOpenState={setOpen} />)
        fireEvent.click(screen.getByRole("button", { name: "Pause notifications…" }))
        // The pause sheet loads with its first open (next/dynamic).
        expect(await screen.findByTestId("pause-sheet")).toBeTruthy()
        expect(setOpen).not.toHaveBeenCalled()
        act(() => pauseSheet!.onOpenChange(false))
        expect(setOpen).toHaveBeenCalledWith(false)
        expect(screen.queryByTestId("pause-sheet")).toBeNull()
    })
})

describe("the More menu's look", () => {
    it("is the v3 sheet: pop, e4, no border, a 32% scrim and a 36x5 grabber", () => {
        open()
        const sheet = document.querySelector("[data-phone-sheet]") as HTMLElement
        // Every sheet's look now (components/ui/drawer, design v3 mobile C5):
        // no border class at all, and the grabber drawn by app/phone.css.
        expect(sheet.className.split(/\s+/)).toEqual(expect.arrayContaining(["bg-pop", "shadow-e4"]))
        expect(sheet.className.split(/\s+/)).not.toContain("border")
        expect(sheet.getAttribute("data-detent")).toBe("large")
        expect(sheet.querySelector("[data-drawer-handle]")?.hasAttribute("data-v3-grabber")).toBe(true)
        const scrim = document.querySelector("[data-vaul-overlay]") as HTMLElement
        expect(scrim.className).toContain("bg-[rgb(10_11_14/0.32)]")
    })

    // Group labels were uppercase and tracked; DESIGN.md keeps labels read on
    // every visit in sentence case. Places sit on a tile in their hue (the
    // playful layer), the same hue wherever that place is listed.
    it("labels its groups in sentence case", () => {
        open()
        for (const label of ["Work", "Workspace"]) {
            const el = screen.getByText(label)
            expect(el.className, label).not.toMatch(/uppercase|tracking/)
        }
    })

    it("sets each place on a tile in its own hue, and leaves Sign out plain", () => {
        caps = ["agent.manage", "workflow.manage", "invitation.create"]
        open()
        const tileOf = (name: string) => {
            const b = screen.getByRole("button", { name: new RegExp(`^${name}`) })
            return b.querySelector("span[aria-hidden='true']")
        }
        expect(tileOf("My tasks")?.className).toContain("hue-moss")
        expect(tileOf("Calendar")?.className).toContain("hue-berry")
        expect(tileOf("Sign out")).toBeNull()
        expect(screen.getByRole("button", { name: /^Your profile/ })).toBeTruthy()
        // A row is 44px.
        expect(screen.getByRole("button", { name: /^My tasks/ }).className.split(/\s+/)).toContain("h-11")
    })
})

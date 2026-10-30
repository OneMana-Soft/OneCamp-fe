import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// On a phone the field's sheet is a chunk of its own (dateRangeSheet), so the
// field's button opens it without being the drawer's trigger: the button still
// says what it opens and whether it's open, and focus comes back to it as the
// sheet closes.
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isDesktop: false }) }))
// Whichever way the sheet opens: a drawer its own trigger opens asks matchMedia
// whether the page runs as an installed app (vaul), and jsdom has none.
vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }))

const { DateRangeField } = await import("./dateRangeField")

afterEach(cleanup)

describe("the date range field on a phone", () => {
  it("opens its sheet from its button, and gives the button focus back as it closes", async () => {
    render(<DateRangeField setDateRange={() => {}} />)
    const button = screen.getByRole("button", { name: "Pick dates" })
    expect([button.getAttribute("aria-haspopup"), button.getAttribute("aria-expanded")]).toEqual(["dialog", "false"])
    fireEvent.click(button)
    const sheet = await screen.findByRole("dialog", { name: "Pick dates" })
    expect(button.getAttribute("aria-expanded")).toBe("true")
    fireEvent.keyDown(sheet, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(button))
    expect(button.getAttribute("aria-expanded")).toBe("false")
  })
})
